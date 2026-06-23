import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { EvidenceRef } from '../../../types.ts';
import { getRunScratchPath, getScratchPath } from '../../scratch-storage.ts';
import type { QaInput } from '../qa/qa-validate-roadmap.ts';

const evidenceRefSchema = z.object({
  source: z.enum(['DS01', 'DS02', 'DS03', 'DS04', 'DS05']),
  recordId: z.string().min(1),
  field: z.string().min(1),
  value: z.string(),
  reason: z.string().min(1),
});

const allocatedTraineeSchema = z.object({
  employeeId: z.string().min(1),
  employeeName: z.string().min(1).optional(),
  position: z.string().min(1),
  team: z.string().min(1).optional(),
  proficiencyLevel: z.string().min(1),
  matchedSkillGap: z.array(z.string().min(1)),
  evidenceRefs: z.array(evidenceRefSchema),
  reason: z.string().min(1),
});

const trainerCandidateSchema = z.object({
  trainerId: z.string().min(1),
  fitScore: z.number(),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  capacityStatus: z.enum(['FULL', 'PARTIAL', 'NONE']),
  availabilityHoursPerMonth: z.number(),
  evidenceRefs: z.array(evidenceRefSchema),
});

const scoreBreakdownSchema = z.object({
  bodAlignment: z.number(),
  projectUrgency: z.number(),
  traineeGapImpact: z.number(),
  surveyDemand: z.number(),
  feasibility: z.number(),
  marketTrend: z.number(),
  riskPenalty: z.number(),
});

function legacyEvidenceRef(recordId: string): EvidenceRef {
  const source = recordId.startsWith('EMP-')
    ? 'DS01'
    : recordId.startsWith('PRJ-')
      ? 'DS02'
      : recordId.startsWith('SUR-') || recordId.startsWith('SUR_')
        ? 'DS03'
        : recordId.startsWith('TRN-')
          ? 'DS04'
          : 'DS05';
  return {
    source,
    recordId,
    field: 'legacy_reference',
    value: recordId,
    reason: 'Legacy fixture reference normalized into the granular evidence contract.',
  };
}

const fallbackMilestoneSchema = z.object({
  week: z.number(),
  description: z.string(),
  deliverable: z.string(),
});

const fallbackPlanSchema = z.object({
  learningMode: z.enum(['self-study', 'external', 'study-group', 'blended', 'lab-based']),
  pic: z.string(),
  materials: z.array(z.string()),
  milestones: z.array(fallbackMilestoneSchema),
  estimatedHours: z.number(),
  evaluationCriteria: z.string(),
});

const initiativeSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  priority: z.enum(['P1', 'P2', 'P3']),
  score: z.number(),
  quarter: z.string().min(1),
  targetTrainees: z.array(z.string()),
  traineeDetails: z.array(allocatedTraineeSchema).optional(),
  canonicalSkillId: z.string().min(1).optional(),
  trainerCandidates: z.array(trainerCandidateSchema).optional(),
  selectedTrainer: z.string().nullable().optional(),
  totalHours: z.number().positive().optional(),
  trainerContactHours: z.number().nonnegative().optional(),
  selfStudyHours: z.number().nonnegative().optional(),
  labHours: z.number().nonnegative().optional(),
  scoreBreakdown: scoreBreakdownSchema.optional(),
  selectionReason: z.string().min(1).optional(),
  risks: z.array(z.string()).optional(),
  requiresHumanApproval: z.boolean().optional(),
  deliveryFormat: z.string().min(1).optional(),
  trainerName: z.string().nullable(),
  objective: z.string().min(1).optional(),
  prerequisites: z.array(z.string()).optional(),
  format: z.enum([
    'INTERNAL_TRAINING',
    'EXTERNAL_TRAINER',
    'GROUP_STUDY',
    'ON_JOB_TRAINING',
    'ONLINE_COURSE',
    'SEMINAR_SHARING',
  ]),
  formatExplanation: z.string().min(1),
  evaluationCriteria: z.string().optional(),
  durationWeeks: z.number().positive().optional(),
  timeline: z
    .object({
      startWeek: z.number().int().min(1).max(13),
      endWeek: z.number().int().min(1).max(13),
    })
    .optional(),
  estimatedHours: z.number().positive(),
  evidence: z
    .array(z.union([evidenceRefSchema, z.string().min(1)]))
    .transform((items) =>
      items.map((item) => (typeof item === 'string' ? legacyEvidenceRef(item) : item)),
    ),
  fallbackReason: z.string().optional(),
  fallbackPlan: fallbackPlanSchema.optional(),
  alignmentType: z.enum(['PROJECT_BACKED', 'BOD_AND_SURVEY_ONLY']).optional(),
  approvalRequired: z.boolean().optional(),
  alignmentNote: z.string().min(1).optional(),
});

const revisionInstructionSchema = z.object({
  initiativeId: z.string().min(1),
  issueType: z.string().min(1),
  action: z.enum([
    'ADD_EVIDENCE',
    'ALLOCATE_TRAINEES',
    'FILTER_SCOPE',
    'ADD_SUPPORTING_PROJECT',
    'RETRY_TRAINER_MATCH_WITH_ALIASES',
    'DOWNGRADE_PRIORITY',
    'CHANGE_ALIGNMENT_TYPE',
    'REMOVE_EXTRA_INITIATIVE',
    'REMOVE_INITIATIVE',
    'ADD_FALLBACK',
    'REQUEST_HUMAN_CONFIRMATION',
  ]),
  message: z.string().min(1),
});

const roadmapOutputAgentSchema = z.object({
  runId: z.string().min(1),
  request: z
    .object({
      userPrompt: z.string(),
    })
    .optional(),
  executionLog: z.array(z.string()),
  initiatives: z.array(initiativeSchema),
  revisionCount: z.number().int().min(0).default(0),
  revisionHistory: z
    .array(
      z.object({
        revision: z.number().int().positive(),
        revisedAt: z.string().min(1),
        instructions: z.array(revisionInstructionSchema),
      }),
    )
    .default([]),
  coverageResult: z
    .object({
      targetGroup: z.string(),
      totalEligibleEmployees: z.number(),
      requiredCoveragePercent: z.number(),
      requiredTraineeCount: z.number(),
      selectedTraineeCount: z.number(),
      achievedCoveragePercent: z.number(),
      coverageStatus: z.enum(['MET', 'NOT_MET']),
      missingTraineeCount: z.number(),
    })
    .optional(),
  dataInventory: z
    .array(
      z.object({
        sourceId: z.enum(['DS01', 'DS02', 'DS03', 'DS04', 'DS05', 'MARKET']),
        fileName: z.string(),
        rowCount: z.number().int().nonnegative(),
        validRows: z.number().int().nonnegative(),
        invalidRows: z.number().int().nonnegative(),
        skippedRows: z.number().int().nonnegative(),
        detectedColumns: z.array(z.string()),
        warnings: z.array(z.string()),
      }),
    )
    .optional(),
  dataCoverageReport: z
    .object({
      totalRecordsBySource: z.record(z.string(), z.number()),
      validRecordsBySource: z.record(z.string(), z.number()),
      candidateCount: z.number().int().nonnegative(),
      selectedCount: z.number().int().nonnegative(),
      droppedCount: z.number().int().nonnegative(),
      unmatchedSkills: z.array(z.string()),
      unmatchedTraineeRows: z.array(z.string()),
      unmatchedTrainerRows: z.array(z.string()),
      warnings: z.array(z.string()),
      coverageResult: z
        .object({
          targetGroup: z.string(),
          totalEligibleEmployees: z.number(),
          requiredCoveragePercent: z.number(),
          requiredTraineeCount: z.number(),
          selectedTraineeCount: z.number(),
          achievedCoveragePercent: z.number(),
          coverageStatus: z.enum(['MET', 'NOT_MET']),
          missingTraineeCount: z.number(),
        })
        .optional(),
    })
    .optional(),
  unselectedCandidates: z
    .array(
      z.object({
        candidate: z.string(),
        reasonDropped: z.string(),
        evidenceRefs: z.array(evidenceRefSchema),
        suggestedFix: z.string(),
      }),
    )
    .optional(),
  toolTrace: z
    .array(
      z.object({
        tool: z.string(),
        status: z.literal('completed'),
        detail: z.string(),
      }),
    )
    .optional(),
});

export type RoadmapOutputAgent = z.infer<typeof roadmapOutputAgentSchema>;

const normalizedDataSchema = z.object({
  employees: z.array(
    z.object({
      employee_id: z.string(),
      position: z.string().optional(),
      proficiency_level: z.string().optional(),
      current_skills: z.array(z.string()).optional(),
      self_reported_gaps: z.array(z.string()),
    }),
  ),
  trainers: z.array(
    z.object({
      trainer_id: z.string(),
      skills: z.array(z.string()),
      available_hours_per_month: z.number(),
    }),
  ),
  projects: z.array(
    z.object({
      project_id: z.string(),
      required_skills: z.array(z.string()),
      _raw_timeline: z.string().optional(),
      deadline: z.string().optional(),
    }),
  ),
  goals: z.array(
    z.object({
      goal_id: z.string(),
      required_skills: z.array(z.string()),
      _raw_description: z.string().optional(),
    }),
  ),
});

async function firstExisting(candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported local/runtime layout.
    }
  }
  throw new Error(`QA input file not found. Checked: ${candidates.join(', ')}`);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

function roadmapCandidates(runId?: string): string[] {
  const configured = process.env.TRAINING_ROADMAP_OUTPUT_FILE;
  if (runId) {
    return [getRunScratchPath(runId, 'roadmap_output_agent.json'), configured].filter(
      (value): value is string => Boolean(value),
    );
  }

  return [
    configured,
    getScratchPath('roadmap_output_agent.json'),
    resolve(process.cwd(), 'scratch/roadmap_output_agent.json'),
    resolve(process.cwd(), 'roadmap_output_agent.json'),
    resolve(process.cwd(), '../../roadmap_output_agent.json'),
    fileURLToPath(new URL('../../../../../../roadmap_output_agent.json', import.meta.url)),
  ].filter((value): value is string => Boolean(value));
}

function normalizedDataCandidates(dataDir?: string): string[] {
  const configured = process.env.TRAINING_ROADMAP_DATA_DIR;
  return [
    dataDir ? resolve(dataDir, 'normalized_data.json') : null,
    dataDir ? resolve(dataDir, 'processed/normalized_data.json') : null,
    configured ? resolve(configured, 'normalized_data.json') : null,
    configured ? resolve(configured, 'processed/normalized_data.json') : null,
    resolve(process.cwd(), 'data/processed/normalized_data.json'),
    resolve(process.cwd(), '../../data/processed/normalized_data.json'),
    fileURLToPath(
      new URL('../../../../../../data/processed/normalized_data.json', import.meta.url),
    ),
  ].filter((value): value is string => value !== null);
}

function trainerType(format: RoadmapOutputAgent['initiatives'][number]['format']) {
  return format === 'INTERNAL_TRAINING' ||
    format === 'ON_JOB_TRAINING' ||
    format === 'SEMINAR_SHARING'
    ? ('internal' as const)
    : format === 'GROUP_STUDY' || format === 'ONLINE_COURSE'
      ? ('self-study' as const)
      : ('external' as const);
}

export async function loadQaInputFromRoadmapOutput(
  runId?: string,
  options: { dataDir?: string } = {},
): Promise<{
  source: RoadmapOutputAgent;
  qaInput: QaInput;
}> {
  const [roadmapPath, normalizedPath] = await Promise.all([
    firstExisting(roadmapCandidates(runId)),
    firstExisting(normalizedDataCandidates(options.dataDir)),
  ]);
  const [sourceRaw, normalizedRaw] = await Promise.all([
    readJson(roadmapPath),
    readJson(normalizedPath),
  ]);
  const source = roadmapOutputAgentSchema.parse(sourceRaw);
  if (runId && source.runId !== runId) {
    throw new Error(`Agent 1 artifact belongs to run ${source.runId}, not ${runId}`);
  }
  const normalized = normalizedDataSchema.parse(normalizedRaw);
  const quarters = [...new Set(source.initiatives.map((initiative) => initiative.quarter))];

  const qaInput: QaInput = {
    ...(source.request ? { request: source.request } : {}),
    roadmap: {
      items: source.initiatives.map((initiative) => ({
        initiativeId: initiative.id,
        skill: initiative.topic,
        traineeIds: initiative.targetTrainees,
        trainerType: initiative.trainerName ? 'internal' : trainerType(initiative.format),
        trainerId: initiative.trainerName,
        fallbackReason:
          initiative.fallbackReason ??
          (initiative.trainerName === null && trainerType(initiative.format) !== 'internal'
            ? `${trainerType(initiative.format).toUpperCase()}_FALLBACK`
            : undefined),
        quarter: initiative.quarter,
        evidence: initiative.evidence,
        alignmentType: initiative.alignmentType,
        approvalRequired: initiative.approvalRequired,
        alignmentNote: initiative.alignmentNote,
        fallbackPlan: initiative.fallbackPlan,
      })),
    },
    priorityResult: {
      initiatives: source.initiatives.map((initiative) => ({
        id: initiative.id,
        skill: initiative.topic,
        target_employees: initiative.targetTrainees,
        internal_trainer_available: initiative.trainerName !== null,
        supporting_projects: initiative.evidence
          .filter((evidence) => evidence.source === 'DS02')
          .map((evidence) => evidence.recordId),
        supporting_bod_goals: initiative.evidence
          .filter((evidence) => evidence.source === 'DS05')
          .map((evidence) => evidence.recordId),
        evidence_summary: initiative.formatExplanation,
        evidence: initiative.evidence,
        quarter: initiative.quarter,
        alignmentType: initiative.alignmentType,
        approvalRequired: initiative.approvalRequired,
        alignmentNote: initiative.alignmentNote,
        fallbackPlan: initiative.fallbackPlan,
      })),
    },
    normalizedData: {
      employees: normalized.employees.map((employee) => ({
        id: employee.employee_id,
        position: employee.position,
        proficiency: employee.proficiency_level,
        currentSkills: employee.current_skills,
        targetSkills: employee.self_reported_gaps,
      })),
      trainers: normalized.trainers.map((trainer) => ({
        id: trainer.trainer_id,
        skills: trainer.skills,
        availableHours: trainer.available_hours_per_month,
      })),
      projects: normalized.projects.map((project) => ({
        id: project.project_id,
        requiredSkills: project.required_skills,
        quarter: project._raw_timeline ?? project.deadline,
      })),
      bodGoals: normalized.goals.map((goal) => ({
        id: goal.goal_id,
        requiredSkills: goal.required_skills,
        description: goal._raw_description,
      })),
      planningHorizon: quarters.join(', '),
    },
  };

  return { source, qaInput };
}
