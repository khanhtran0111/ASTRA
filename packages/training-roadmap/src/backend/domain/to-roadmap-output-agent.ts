import type { DraftRoadmapOutput, EvidenceRef } from '../../types.ts';
import type {
  DataDrivenCoordinatorResult,
  DataDrivenFormat,
  IndexedEvidenceRef,
} from './data-driven-pipeline.ts';
import { generateFallbackPlan } from './fallback-plan.ts';
import type { RoadmapOutputAgent } from './qa/roadmap-output-loader.ts';

type ArtifactFormat = RoadmapOutputAgent['initiatives'][number]['format'];

function toArtifactFormat(format: DataDrivenFormat): ArtifactFormat {
  switch (format) {
    case 'INTERNAL_TRAINING':
    case 'BLENDED_INTERNAL_SELF_STUDY':
      return 'INTERNAL_TRAINING';
    case 'SELF_STUDY_WITH_INTERNAL_MENTOR':
      return 'GROUP_STUDY';
    case 'SELF_STUDY':
      return 'ONLINE_COURSE';
    case 'EXTERNAL_TRAINER':
      return 'EXTERNAL_TRAINER';
  }
}

function isQaEvidenceSource(
  sourceId: IndexedEvidenceRef['sourceId'],
): sourceId is EvidenceRef['source'] {
  return sourceId !== 'MARKET';
}

function toEvidenceRef(ref: IndexedEvidenceRef): EvidenceRef | null {
  if (!isQaEvidenceSource(ref.sourceId)) return null;
  return {
    source: ref.sourceId,
    recordId: ref.rowId,
    field: ref.field,
    value: ref.value,
    reason: ref.reason,
  };
}

function evidenceRefs(refs: IndexedEvidenceRef[]): EvidenceRef[] {
  return refs.map(toEvidenceRef).filter((ref): ref is EvidenceRef => ref !== null);
}

export function toDraftRoadmapOutput(
  snapshot: DataDrivenCoordinatorResult,
  roadmapId = 'RM-2026-V1',
): DraftRoadmapOutput {
  const quarters = snapshot.roadmap.initiatives.reduce<DraftRoadmapOutput['quarters']>(
    (accumulator, initiative) => {
      const key = initiative.quarter.replace(/\s+/g, '_');
      const items = accumulator[key] ?? [];
      items.push({
        classId: initiative.id,
        topic: initiative.topic,
        priorityScore: initiative.score,
        estimatedHours: initiative.totalHours,
        traineeCount: initiative.trainees.length,
        trainees: initiative.trainees.map((trainee) => trainee.employeeId),
        evidence: evidenceRefs(initiative.evidenceRefs),
        resource: {
          trainerId: initiative.selectedTrainer,
          isExternalRequired: initiative.format === 'EXTERNAL_TRAINER',
          fallbackReason: initiative.fallbackReason ?? null,
        },
      });
      accumulator[key] = items;
      return accumulator;
    },
    {},
  );

  return {
    roadmapId,
    status: 'DRAFT',
    generatedAt: new Date().toISOString(),
    quarters,
  };
}

export function buildTrainingRoadmapPrompt(userPrompt: string, feedback?: string): string {
  const trimmedFeedback = feedback?.trim();
  return trimmedFeedback ? `${userPrompt}\n\nReviewer feedback:\n${trimmedFeedback}` : userPrompt;
}

/**
 * The single adapter between the deterministic data-first coordinator and the
 * Agent 1 artifact contract consumed by QA. No route or UI code should remap
 * coordinator snapshots independently.
 */
export function toRoadmapOutputAgent(args: {
  snapshot: DataDrivenCoordinatorResult;
  userPrompt: string;
  feedback?: string;
  previousSource?: RoadmapOutputAgent;
}): RoadmapOutputAgent {
  const prompt = buildTrainingRoadmapPrompt(args.userPrompt, args.feedback);
  return {
    runId: args.snapshot.runId,
    request: { userPrompt: prompt },
    executionLog: [
      ...args.snapshot.toolTrace.map((entry) => `${entry.tool}: ${entry.detail}`),
      ...(args.feedback?.trim() ? ['Applied human feedback to the data-first run.'] : []),
      'Generated canonical roadmap_output_agent.json from the data-first snapshot.',
    ],
    revisionCount: args.previousSource?.revisionCount ?? 0,
    revisionHistory: args.previousSource?.revisionHistory ?? [],
    initiatives: args.snapshot.roadmap.initiatives.map((initiative) => {
      const projectBacked = initiative.evidenceRefs.some((ref) => ref.sourceId === 'DS02');
      const objective = initiative.objectives.join(' ').trim();
      const fallbackPlan = initiative.fallbackReason
        ? generateFallbackPlan({
            skillName: initiative.topic,
            fallbackReason:
              initiative.fallbackReason === 'ERR_NO_CAPACITY'
                ? 'CAPACITY_EXCEEDED'
                : 'TRAINER_NOT_FOUND',
            estimatedHours: initiative.totalHours,
            traineeCount: initiative.trainees.length,
          })
        : undefined;
      return {
        id: initiative.id,
        topic: initiative.topic,
        priority: initiative.priority,
        score: initiative.score,
        quarter: initiative.quarter,
        targetTrainees: initiative.trainees.map((trainee) => trainee.employeeId),
        traineeDetails: initiative.trainees.map((trainee) => ({
          employeeId: trainee.employeeId,
          ...(trainee.employeeName ? { employeeName: trainee.employeeName } : {}),
          position: trainee.role ?? 'Unknown role',
          ...(trainee.team ? { team: trainee.team } : {}),
          proficiencyLevel: trainee.proficiency ?? 'Unknown proficiency',
          matchedSkillGap: [trainee.matchedGap],
          evidenceRefs: evidenceRefs(trainee.evidenceRefs),
          reason: trainee.reason,
        })),
        canonicalSkillId: initiative.canonicalSkillId,
        trainerCandidates: initiative.trainerCandidates.map((trainer) => ({
          trainerId: trainer.trainerId,
          fitScore: trainer.fitScore,
          matchedSkills: trainer.matchedSkills,
          missingSkills: trainer.missingSkills,
          capacityStatus: trainer.capacityStatus,
          availabilityHoursPerMonth: trainer.availabilityHoursPerMonth,
          evidenceRefs: evidenceRefs(trainer.evidenceRefs),
        })),
        selectedTrainer: initiative.selectedTrainer,
        totalHours: initiative.totalHours,
        trainerContactHours: initiative.trainerContactHours,
        selfStudyHours: initiative.selfStudyHours,
        labHours: initiative.labHours,
        scoreBreakdown: initiative.scoreBreakdown,
        selectionReason: initiative.selectionReason,
        risks: initiative.risks,
        requiresHumanApproval: initiative.requiresHumanApproval,
        deliveryFormat: initiative.format,
        trainerName: initiative.selectedTrainer,
        ...(objective ? { objective } : {}),
        prerequisites: initiative.prerequisites,
        format: toArtifactFormat(initiative.format),
        formatExplanation: initiative.trainerDecision,
        evaluationCriteria: initiative.evaluationCriteria,
        durationWeeks: initiative.weeks.durationWeeks,
        timeline: {
          startWeek: initiative.weeks.startWeek,
          endWeek: initiative.weeks.endWeek,
        },
        estimatedHours: initiative.totalHours,
        evidence: evidenceRefs(initiative.evidenceRefs),
        ...(initiative.fallbackReason ? { fallbackReason: initiative.fallbackReason } : {}),
        ...(fallbackPlan ? { fallbackPlan } : {}),
        alignmentType: projectBacked
          ? ('PROJECT_BACKED' as const)
          : ('BOD_AND_SURVEY_ONLY' as const),
        approvalRequired: initiative.requiresHumanApproval || !projectBacked,
        alignmentNote: projectBacked
          ? 'Direct DS02 project requirement evidence supports this initiative.'
          : 'No direct DS02 project requirement was found; retain for explicit human risk review.',
      };
    }),
    ...(args.snapshot.coverageReport.coverageResult
      ? { coverageResult: args.snapshot.coverageReport.coverageResult }
      : {}),
    dataInventory: args.snapshot.inventory,
    dataCoverageReport: {
      ...args.snapshot.coverageReport,
      totalRecordsBySource: { ...args.snapshot.coverageReport.totalRecordsBySource },
      validRecordsBySource: { ...args.snapshot.coverageReport.validRecordsBySource },
    },
    unselectedCandidates: args.snapshot.unselectedCandidates.map((candidate) => ({
      candidate: candidate.candidate,
      reasonDropped: candidate.reasonDropped,
      evidenceRefs: evidenceRefs(candidate.evidenceRefs),
      suggestedFix: candidate.suggestedFix,
    })),
    toolTrace: args.snapshot.toolTrace,
  };
}
