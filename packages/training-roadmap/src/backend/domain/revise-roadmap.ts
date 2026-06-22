import type { Priority, RevisionInstruction } from '../../types.ts';
import { calculateCoverage, parseCoverageTarget } from './coverage-calculator.ts';
import {
  loadEmployeeProfiles,
  loadProjectProfiles,
  loadRequestedEvidenceRefs,
} from './data-loader.ts';
import { generateFallbackPlan } from './fallback-plan.ts';
import { enforcePromptScope, parseRoadmapConstraints } from './prompt-constraints.ts';
import type { RoadmapOutputAgent } from './qa/roadmap-output-loader.ts';
import { allocateTraineesForInitiative } from './trainee-allocator.ts';

function downgradePriority(priority: Priority): Priority {
  if (priority === 'P1') return 'P2';
  return 'P3';
}

function requestedQuarter(userPrompt: string | undefined): string | null {
  const match = /Q([1-4])\D*(20\d{2})/i.exec(userPrompt ?? '');
  return match ? `Q${match[1]} ${match[2]}` : null;
}

export function reviseRoadmap(
  source: RoadmapOutputAgent,
  instructions: RevisionInstruction[],
): RoadmapOutputAgent {
  const byInitiative = new Map<string, RevisionInstruction[]>();
  for (const instruction of instructions) {
    const group = byInitiative.get(instruction.initiativeId) ?? [];
    group.push(instruction);
    byInitiative.set(instruction.initiativeId, group);
  }
  const targetQuarter = requestedQuarter(source.request?.userPrompt);
  const constraints = parseRoadmapConstraints(source.request?.userPrompt ?? '');

  const revisedInitiatives = source.initiatives.flatMap((initiative) => {
    const initiativeInstructions = byInitiative.get(initiative.id) ?? [];
    if (initiativeInstructions.length === 0) return [initiative];

    const revised = { ...initiative };
    for (const instruction of initiativeInstructions) {
      if (instruction.issueType === 'MISSING_PROJECT_REQUIREMENT') {
        revised.alignmentType = 'BOD_AND_SURVEY_ONLY';
        revised.approvalRequired = true;
        revised.alignmentNote = 'No direct project roadmap evidence found; requires L&D approval.';
        revised.priority = downgradePriority(revised.priority);
        revised.score = Math.min(revised.score, revised.priority === 'P2' ? 84 : 64);
        continue;
      }

      if (instruction.action === 'ADD_FALLBACK') {
        revised.trainerName = null;
        revised.format = 'EXTERNAL_TRAINER';
        revised.fallbackReason ??= 'SKILL_NOT_FOUND_INTERNAL';
        revised.fallbackPlan ??= generateFallbackPlan({
          skillName: revised.topic,
          fallbackReason:
            revised.fallbackReason === 'CAPACITY_EXCEEDED'
              ? 'CAPACITY_EXCEEDED'
              : 'TRAINER_NOT_FOUND',
          estimatedHours: revised.estimatedHours,
          traineeCount: revised.targetTrainees.length,
        });
        revised.formatExplanation =
          'No qualified internal trainer has sufficient availability; use a documented external fallback.';
        continue;
      }

      if (instruction.issueType === 'TIMELINE_MISMATCH' && targetQuarter) {
        revised.quarter = targetQuarter;
        continue;
      }

      if (
        instruction.issueType === 'NO_TRAINEE_EVIDENCE' ||
        instruction.action === 'ALLOCATE_TRAINEES'
      ) {
        const employees = loadEmployeeProfiles();
        const projects = loadProjectProfiles();
        const userPrompt = source.request?.userPrompt || '';
        const coverageTarget = parseCoverageTarget(userPrompt);

        const requiredByBod = revised.evidence
          .filter((ref) => ref.source === 'DS05')
          .map((ref) => ref.recordId);
        const requiredByProject = revised.evidence
          .filter((ref) => ref.source === 'DS02')
          .map((ref) => ref.recordId);
        const requestedRefs = loadRequestedEvidenceRefs({
          skillName: revised.topic,
          projectIds: constraints.requiredProjectIds,
          goalIds: constraints.requiredGoalIds,
        });

        const allocated = allocateTraineesForInitiative({
          skillName: revised.topic,
          employees,
          targetGroup: coverageTarget?.targetGroup || undefined,
          targetRoles: constraints.targetRoles,
          targetSkillGaps: constraints.targetSkillGaps,
          maxTrainees: constraints.maxTrainees,
          requiredByBod,
          requiredByProject,
          projects,
        });

        revised.targetTrainees = allocated.map((t) => t.employeeId);
        revised.traineeDetails = allocated;
        const otherRefs = [
          ...revised.evidence.filter((ref) => ref.source !== 'DS01'),
          ...requestedRefs,
        ].filter(
          (ref, index, refs) =>
            refs.findIndex(
              (candidate) => candidate.source === ref.source && candidate.recordId === ref.recordId,
            ) === index,
        );
        const ds01Refs = allocated.flatMap((t) => t.evidenceRefs);
        revised.evidence = [...otherRefs, ...ds01Refs];
        continue;
      }

      if (
        (instruction.action === 'REMOVE_INITIATIVE' ||
          instruction.action === 'REMOVE_EXTRA_INITIATIVE' ||
          instruction.action === 'FILTER_SCOPE') &&
        instruction.issueType === 'PROMPT_SCOPE_VIOLATION'
      ) {
        if (
          constraints.requestedTopics?.length ||
          constraints.requestedInitiativeCount !== undefined
        ) {
          continue;
        }
        return [];
      }

      if (instruction.action === 'DOWNGRADE_PRIORITY') {
        revised.priority = downgradePriority(revised.priority);
        revised.score = Math.min(revised.score, revised.priority === 'P2' ? 84 : 64);
      }
    }
    return [revised];
  });

  const initiatives = enforcePromptScope(revisedInitiatives, constraints);

  // Recalculate overall coverage result if target group is defined
  let coverageResult = source.coverageResult;
  const userPrompt = source.request?.userPrompt || '';
  const coverageTarget = parseCoverageTarget(userPrompt);
  if (coverageTarget) {
    const employees = loadEmployeeProfiles();
    const allSelectedTraineeIds = [...new Set(initiatives.flatMap((n) => n.targetTrainees))];
    coverageResult = calculateCoverage({
      employees,
      targetGroup: coverageTarget.targetGroup,
      requiredCoveragePercent: coverageTarget.requiredPercent,
      selectedTraineeIds: allSelectedTraineeIds,
    });
  }

  const revisionCount = source.revisionCount + 1;
  return {
    ...source,
    initiatives,
    coverageResult,
    revisionCount,
    revisionHistory: [
      ...source.revisionHistory,
      {
        revision: revisionCount,
        revisedAt: new Date().toISOString(),
        instructions,
      },
    ],
    executionLog: [
      ...source.executionLog.filter((entry) => entry !== 'Paused at Human Review Gate.'),
      'Agent 2 requested roadmap revision.',
      'Agent 1 revised the roadmap from Agent 2 instructions.',
    ],
  };
}
