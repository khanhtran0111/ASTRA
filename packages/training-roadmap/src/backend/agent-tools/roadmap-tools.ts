/**
 * Agent Tools for the L&D Coordinator Agent (Agent 1).
 *
 * These tools wrap the deterministic domain logic (match-trainers,
 * generate-roadmap) into SETA agent tools via `defineAgentTool`, making
 * them callable by the LLM orchestrator via function calling.
 *
 * The tools themselves contain NO LLM logic — they are pure wrappers
 * around rule-based domain functions.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { calculateCoverage, parseCoverageTarget } from '../domain/coverage-calculator.ts';
import {
  loadEmployeeProfiles,
  loadProjectProfiles,
  loadRealData,
  loadRequestedEvidenceRefs,
  loadTrainersFromCSV,
} from '../domain/data-loader.ts';
import { generateDraftRoadmap } from '../domain/generate-roadmap.ts';
import { matchTrainers } from '../domain/match-trainers.ts';
import { parseRoadmapConstraints } from '../domain/prompt-constraints.ts';
import { allocateTraineesForInitiative } from '../domain/trainee-allocator.ts';
import type { InternalTrainer } from '../domain/types.ts';
import { getActiveRunScratchPath } from '../scratch-storage.ts';

// ---------------------------------------------------------------------------
// Zod Schemas for tool input / output validation
// ---------------------------------------------------------------------------

const EvidenceSchema = z.object({
  bodGoals: z.array(z.string()),
  projectIds: z.array(z.string()),
  surveyIds: z.array(z.string()),
});

const EvidenceRefSchema = z.object({
  source: z.enum(['DS01', 'DS02', 'DS03', 'DS04', 'DS05']),
  recordId: z.string(),
  field: z.string(),
  value: z.string(),
  reason: z.string(),
});

const AllocatedTraineeSchema = z.object({
  employeeId: z.string(),
  position: z.string(),
  proficiencyLevel: z.string(),
  matchedSkillGap: z.array(z.string()),
  evidenceRefs: z.array(EvidenceRefSchema),
  reason: z.string(),
});

const FallbackReasonSchema = z.enum(['SKILL_NOT_FOUND_INTERNAL', 'CAPACITY_EXCEEDED']);
const LearningFormatSchema = z.enum([
  'INTERNAL_TRAINING',
  'ON_JOB_TRAINING',
  'GROUP_STUDY',
  'EXTERNAL_TRAINER',
  'ONLINE_COURSE',
  'SEMINAR_SHARING',
]);

const FallbackMilestoneSchema = z.object({
  week: z.number(),
  description: z.string(),
  deliverable: z.string(),
});

const FallbackPlanSchema = z.object({
  learningMode: z.enum(['self-study', 'external', 'study-group', 'blended', 'lab-based']),
  pic: z.string(),
  materials: z.array(z.string()),
  milestones: z.array(FallbackMilestoneSchema),
  estimatedHours: z.number(),
  evaluationCriteria: z.string(),
});

const MatchedTrainingClassSchema = z.object({
  classId: z.string(),
  skillName: z.string(),
  trainees: z.array(z.string()),
  assignedTrainer: z.string().nullable(),
  isExternalRequired: z.boolean(),
  fallbackReason: FallbackReasonSchema.optional(),
  fallbackPlan: FallbackPlanSchema.optional(),
  learningFormat: LearningFormatSchema.optional(),
  targetQuarter: z.string(),
  evidence: EvidenceSchema,
  evidenceRefs: z.array(EvidenceRefSchema).optional(),
  allocatedTrainees: z.array(AllocatedTraineeSchema).optional(),
  priorityScore: z.number(),
  estimatedHours: z.number(),
  objective: z.string().optional(),
  prerequisites: z.array(z.string()).optional(),
  formatExplanation: z.string().optional(),
  evaluationCriteria: z.string().optional(),
  durationWeeks: z.number().optional(),
  startWeek: z.number().optional(),
  endWeek: z.number().optional(),
});

export const MatchedTrainingClassesSchema = z.array(MatchedTrainingClassSchema);

const RoadmapClassEntrySchema = z.object({
  classId: z.string(),
  topic: z.string(),
  priorityScore: z.number(),
  alignmentEvidence: z.object({
    bodGoals: z.array(z.string()),
    projects: z.array(z.string()),
  }),
  evidence: z.array(EvidenceRefSchema),
  traineeCount: z.number(),
  trainees: z.array(z.string()),
  traineeDetails: z.array(AllocatedTraineeSchema).optional(),
  estimatedHours: z.number(),
  objective: z.string().optional(),
  prerequisites: z.array(z.string()).optional(),
  learningFormat: LearningFormatSchema.optional(),
  formatExplanation: z.string().optional(),
  evaluationCriteria: z.string().optional(),
  durationWeeks: z.number().optional(),
  startWeek: z.number().optional(),
  endWeek: z.number().optional(),
  fallbackPlan: FallbackPlanSchema.optional(),
  resource: z.object({
    trainerId: z.string().nullable(),
    isExternalRequired: z.boolean(),
    fallbackReason: FallbackReasonSchema.nullable(),
  }),
});

const DraftRoadmapOutputSchema = z.object({
  roadmapId: z.string(),
  status: z.literal('DRAFT'),
  generatedAt: z.string(),
  quarters: z.record(z.string(), z.array(RoadmapClassEntrySchema)),
});

const PendingSkillsOutputSchema = z.array(
  z.object({
    skillName: z.string(),
    traineeCount: z.number(),
    priorityScore: z.number(),
    targetQuarter: z.string(),
  }),
);

const TrainerAssignmentOutputSchema = z.object({
  success: z.literal(true),
  totalNeeds: z.number(),
  internallyAssigned: z.number(),
  externalRequired: z.number(),
  matchedClasses: MatchedTrainingClassesSchema,
});

const LearningFormatsOutputSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Tool 1: Get Pending Skills
// ---------------------------------------------------------------------------

export const lndGetPendingSkills = createTool({
  id: 'lnd_getPendingSkills',
  description:
    'Retrieve the list of pending training needs/skills to estimate required hours. You can optionally filter by targetTeam if the user requested a specific team.',
  inputSchema: z.object({
    targetTeam: z.string().optional(),
    targetProficiency: z.string().optional(),
    targetQuarter: z.string().optional(),
  }),
  outputSchema: PendingSkillsOutputSchema,
  execute: async (args) => {
    const { targetTeam, targetProficiency, targetQuarter } = args;

    console.log(`Tool lndGetPendingSkills called by LLM with targetTeam: ${targetTeam || 'None'}`);

    const needs = loadRealData(targetTeam, targetProficiency, targetQuarter).trainingNeeds;

    return needs.map((n) => ({
      skillName: n.skillName,
      traineeCount: n.traineeIds.length,
      priorityScore: n.priorityScore,
      targetQuarter: n.targetQuarter,
    }));
  },
});

// ---------------------------------------------------------------------------
// Tool 2: Find and Assign Trainers
// ---------------------------------------------------------------------------

export const lndFindAndAssignTrainer = createTool({
  id: 'lnd_findAndAssignTrainer',
  description: [
    'Match a list of prioritized training needs to internal trainers.',
    '',
    'This tool performs DETERMINISTIC capacity checking:',
    '1. Finds trainers whose expertise matches each skill (case-insensitive)',
    '2. Checks if the trainer has enough available hours per month',
    '3. Assigns the trainer and deducts their capacity',
    '4. Flags SKILL_NOT_FOUND_INTERNAL or CAPACITY_EXCEEDED if no assignment possible',
    '',
    'If no trainers are provided, uses the default internal trainer pool.',
  ].join('\n'),
  inputSchema: z.object({
    targetTeam: z.string().optional(),
    targetProficiency: z.string().optional(),
    targetQuarter: z.string().optional(),
    relevantSkills: z
      .array(z.string())
      .optional()
      .describe(
        'List of skill names (P1, P2, P3) that are kept after your semantic filtering. Only these will be matched.',
      ),
    estimatedHoursMap: z
      .record(z.string(), z.number())
      .describe(
        'A JSON object mapping skillName to estimated hours (e.g., {"Kubernetes": 40, "Python": 20})',
      ),
  }),
  outputSchema: TrainerAssignmentOutputSchema,
  execute: async (args) => {
    try {
      console.log('ARGS lndFindAndAssignTrainer:', JSON.stringify(args, null, 2));

      const { estimatedHoursMap, targetTeam, targetProficiency, targetQuarter, relevantSkills } =
        args;

      console.log(
        `Tool lndFindAndAssignTrainer called with targetTeam=${targetTeam}, relevantSkills=${relevantSkills?.length}`,
      );

      const trainerPool: InternalTrainer[] = loadTrainersFromCSV();

      let resolvedNeeds = loadRealData(
        targetTeam,
        targetProficiency,
        targetQuarter,
      ).trainingNeeds.sort((a, b) => b.priorityScore - a.priorityScore);

      // Filter out irrelevant P1/P2 skills before matching to save trainer capacity.
      if (relevantSkills && Array.isArray(relevantSkills)) {
        resolvedNeeds = resolvedNeeds.filter((need) => relevantSkills.includes(need.skillName));
      }

      // Trainee allocation based on DS01 and other rules
      const employees = loadEmployeeProfiles();
      const projects = loadProjectProfiles();

      // Read userPrompt if metadata exists
      let userPrompt = '';
      try {
        const metaPath = getActiveRunScratchPath('run_metadata.json');
        if (existsSync(metaPath)) {
          const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
          userPrompt = meta.userPrompt || '';
        }
      } catch {}

      const coverageTarget = parseCoverageTarget(userPrompt);
      const constraints = parseRoadmapConstraints(userPrompt);

      for (const need of resolvedNeeds) {
        const requestedRefs = loadRequestedEvidenceRefs({
          skillName: need.skillName,
          projectIds: constraints.requiredProjectIds,
          goalIds: constraints.requiredGoalIds,
        });
        const supportingRefs = [
          ...(need.evidenceRefs?.filter((ref) => ref.source !== 'DS01') ?? []),
          ...requestedRefs,
        ].filter(
          (ref, index, refs) =>
            refs.findIndex(
              (candidate) => candidate.source === ref.source && candidate.recordId === ref.recordId,
            ) === index,
        );
        need.evidence.projectIds = [
          ...new Set([
            ...need.evidence.projectIds,
            ...supportingRefs.filter((ref) => ref.source === 'DS02').map((ref) => ref.recordId),
          ]),
        ];
        need.evidence.bodGoals = [
          ...new Set([
            ...need.evidence.bodGoals,
            ...supportingRefs.filter((ref) => ref.source === 'DS05').map((ref) => ref.recordId),
          ]),
        ];
        const allocated = allocateTraineesForInitiative({
          skillName: need.skillName,
          employees,
          targetGroup: coverageTarget?.targetGroup || targetTeam || undefined,
          targetRoles: constraints.targetRoles,
          targetSkillGaps: constraints.targetSkillGaps,
          maxTrainees: constraints.maxTrainees,
          requiredByBod: need.evidence.bodGoals,
          requiredByProject: need.evidence.projectIds,
          projects,
        });

        need.traineeIds = allocated.map((t) => t.employeeId);
        need.allocatedTrainees = allocated;
        need.evidenceRefs = [...supportingRefs, ...allocated.flatMap((t) => t.evidenceRefs)];
      }

      // If a coverage target was parsed, calculate overall coverage across all initiatives
      if (coverageTarget) {
        const allSelectedTraineeIds = [...new Set(resolvedNeeds.flatMap((n) => n.traineeIds))];
        const coverageResult = calculateCoverage({
          employees,
          targetGroup: coverageTarget.targetGroup,
          requiredCoveragePercent: coverageTarget.requiredPercent,
          selectedTraineeIds: allSelectedTraineeIds,
        });

        writeFileSync(
          getActiveRunScratchPath('coverage_result.json'),
          JSON.stringify(coverageResult, null, 2),
        );
      }

      // Override estimated hours with LLM's estimations.
      if (estimatedHoursMap) {
        for (const need of resolvedNeeds) {
          const estimatedHours = estimatedHoursMap[need.skillName];
          if (estimatedHours) {
            need.estimatedHours = estimatedHours;
          }
        }
      }

      const matched = matchTrainers(resolvedNeeds, trainerPool);

      // Save matched classes to runtime scratch for the next tool to use.
      writeFileSync(
        getActiveRunScratchPath('matched_classes.json'),
        JSON.stringify(matched, null, 2),
      );

      const assigned = matched.filter((m) => !m.isExternalRequired).length;

      return {
        success: true as const,
        totalNeeds: resolvedNeeds.length,
        internallyAssigned: assigned,
        externalRequired: matched.length - assigned,
        matchedClasses: matched,
      };
    } catch (error: unknown) {
      console.error('Error in lndFindAndAssignTrainer:', error);
      throw new Error(`Failed to match trainers: ${getErrorMessage(error)}`);
    }
  },
});

// ---------------------------------------------------------------------------
// Tool 3: Assign Learning Formats
// ---------------------------------------------------------------------------

export const lndAssignLearningFormats = createTool({
  id: 'lnd_assignLearningFormats',
  description: [
    'Assign a learning format for each skill, especially those lacking an internal trainer.',
    'Formats: INTERNAL_TRAINING, ON_JOB_TRAINING, GROUP_STUDY, EXTERNAL_TRAINER, ONLINE_COURSE, SEMINAR_SHARING',
  ].join('\n'),
  inputSchema: z.object({
    formatMap: z
      .record(z.string(), z.string())
      .describe('A JSON object mapping skillName to LearningFormat enum string.'),
  }),
  outputSchema: LearningFormatsOutputSchema,
  execute: async (args) => {
    try {
      console.log('ARGS lndAssignLearningFormats:', JSON.stringify(args, null, 2));

      const { formatMap } = args;

      console.log('Tool lndAssignLearningFormats called by LLM with map:', formatMap);

      const filePath = getActiveRunScratchPath('matched_classes.json');

      const raw = readFileSync(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      const matchedClasses = MatchedTrainingClassesSchema.parse(parsed);

      for (const cls of matchedClasses) {
        const learningFormat = LearningFormatSchema.safeParse(formatMap[cls.skillName]);
        if (learningFormat.success) {
          cls.learningFormat = learningFormat.data;
        } else {
          cls.learningFormat = cls.isExternalRequired ? 'EXTERNAL_TRAINER' : 'INTERNAL_TRAINING';
        }
      }

      writeFileSync(filePath, JSON.stringify(matchedClasses, null, 2));

      return {
        success: true as const,
        message: 'Learning formats assigned successfully',
      };
    } catch (error: unknown) {
      console.error('Error in lndAssignLearningFormats:', error);
      throw new Error(`Failed to assign learning formats: ${getErrorMessage(error)}`);
    }
  },
});

// ---------------------------------------------------------------------------
// Tool 4: Compile Quarterly Roadmap
// ---------------------------------------------------------------------------

export const lndCompileQuarterlyRoadmap = createTool({
  id: 'lnd_compileQuarterlyRoadmap',
  description: [
    'Compile matched training classes into a quarterly draft roadmap.',
    '',
    'Groups classes by targetQuarter and produces the DraftRoadmapOutput JSON.',
    'This is the FINAL step — the output goes directly to the QA Agent for review.',
    '',
    'Pass the matchedClasses output from lnd_findAndAssignTrainer.',
  ].join('\n'),
  inputSchema: z.object({
    roadmapId: z
      .string()
      .optional()
      .describe('Roadmap version identifier. Defaults to "RM-2026-V1".'),
  }),
  outputSchema: DraftRoadmapOutputSchema,
  execute: async (args) => {
    const { roadmapId } = args;

    const raw = readFileSync(getActiveRunScratchPath('matched_classes.json'), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    const matchedClasses = MatchedTrainingClassesSchema.parse(parsed);

    return generateDraftRoadmap(matchedClasses, roadmapId);
  },
});
