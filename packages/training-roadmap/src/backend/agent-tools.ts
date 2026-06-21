import { type AgentTool, defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';
import {
  lndAssignLearningFormats,
  lndCompileQuarterlyRoadmap,
  lndFindAndAssignTrainer,
  lndGetPendingSkills,
} from './agent-tools/roadmap-tools.ts';
import { calculateQaScore } from './domain/qa/qa-score.ts';
import {
  getQaFinalFindings,
  getQaToolRun,
  markQaToolCalled,
  recordQaScoreCall,
  recordQaToolResult,
} from './domain/qa/qa-tool-context.ts';
import type { QaFinding } from './domain/qa/qa-types.ts';
import { checkBodAlignment } from './domain/qa/rules/bod-alignmen.rule.ts';
import { checkInvalidTrainee } from './domain/qa/rules/invalid-trainee.rule.ts';
import { checkMissingEvidence } from './domain/qa/rules/missing-evidence.rule.ts';
import { checkProjectRequirement } from './domain/qa/rules/project-requirement.rule.ts';
import { checkTimelineRisk } from './domain/qa/rules/timeline-risk.rule.ts';
import { checkTraceabilityGap } from './domain/qa/rules/traceability-gap.rule.ts';
import { checkTraineeMismatch } from './domain/qa/rules/trainee-mismatch.rule.ts';
import { checkTrainerGap } from './domain/qa/rules/trainer-gap.rule.ts';

export const QA_TOOL_IDS = {
  invalidTrainees: 'trainingRoadmap_checkInvalidTrainees',
  trainerCapacity: 'trainingRoadmap_checkTrainerCapacity',
  missingEvidence: 'trainingRoadmap_checkMissingEvidence',
  bodAlignment: 'trainingRoadmap_analyzeBodAlignment',
  projectRequirements: 'trainingRoadmap_analyzeProjectRequirements',
  traineeDesire: 'trainingRoadmap_checkTraineeDesire',
  timeline: 'trainingRoadmap_checkTimelineFit',
  traceability: 'trainingRoadmap_checkTraceability',
  score: 'trainingRoadmap_calculateQaScore',
} as const;

const runInputSchema = z.object({ runId: z.string().min(1) });
const evidenceSchema = z.object({ path: z.string().min(1), value: z.string() });
const findingSchema = z.object({
  type: z.enum([
    'INVALID_TRAINEE',
    'TRAINER_GAP',
    'MISSING_EVIDENCE',
    'BOD_ALIGNMENT_RISK',
    'MISSING_PROJECT_REQUIREMENT',
    'TRAINEE_MISMATCH',
    'TIMELINE_RISK',
    'TRACEABILITY_GAP',
  ]),
  severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  message: z.string(),
  skill: z.string().optional(),
  relatedInitiativeId: z.string().optional(),
  evidence: z.array(evidenceSchema),
});
const findingsOutputSchema = z.object({ findings: z.array(findingSchema) });

function serializeFindings(findings: QaFinding[]): z.infer<typeof findingSchema>[] {
  return findings.map((finding) => ({
    ...finding,
    evidence: finding.evidence.map((evidence) => ({
      path: evidence.path,
      value: JSON.stringify(evidence.value),
    })),
  }));
}

function ruleTool(
  id: string,
  name: string,
  description: string,
  check: (runId: string) => QaFinding[],
): AgentTool {
  return defineAgentTool({
    id,
    name,
    description,
    input: runInputSchema,
    output: findingsOutputSchema,
    execute: async ({ runId }) => {
      markQaToolCalled(runId, id);
      const result = { findings: serializeFindings(check(runId)) };
      recordQaToolResult(runId, id, result);
      return result;
    },
  });
}

const invalidTraineesTool = ruleTool(
  QA_TOOL_IDS.invalidTrainees,
  'Check invalid trainees',
  'Find roadmap trainee IDs that do not exist in normalized employee data.',
  (runId) => {
    const input = getQaToolRun(runId);
    return checkInvalidTrainee(input.roadmap ?? { items: [] }, input.normalizedData);
  },
);

const trainerCapacityTool = ruleTool(
  QA_TOOL_IDS.trainerCapacity,
  'Check trainer capacity',
  'Check internal delivery against trainer skills, availability, and priority availability signals.',
  (runId) => {
    const input = getQaToolRun(runId);
    return checkTrainerGap(
      input.roadmap ?? { items: [] },
      input.priorityResult,
      input.normalizedData,
    );
  },
);

const missingEvidenceTool = ruleTool(
  QA_TOOL_IDS.missingEvidence,
  'Check missing evidence',
  'Find initiatives with no supporting project, BOD goal, or evidence summary.',
  (runId) => checkMissingEvidence(getQaToolRun(runId).priorityResult),
);

const traineeDesireTool = ruleTool(
  QA_TOOL_IDS.traineeDesire,
  'Check trainee desire',
  'Compare every assigned trainee target-skill list with the roadmap initiative skill.',
  (runId) => {
    const input = getQaToolRun(runId);
    return checkTraineeMismatch(input.roadmap ?? { items: [] }, input.normalizedData);
  },
);

const timelineTool = ruleTool(
  QA_TOOL_IDS.timeline,
  'Check timeline fit',
  'Compare initiative quarters with supporting project quarters and the planning horizon.',
  (runId) => {
    const input = getQaToolRun(runId);
    return checkTimelineRisk(
      input.roadmap ?? { items: [] },
      input.priorityResult,
      input.normalizedData,
    );
  },
);

const traceabilityTool = ruleTool(
  QA_TOOL_IDS.traceability,
  'Check traceability',
  'Find roadmap evidence identifiers that do not resolve to normalized projects or BOD goals.',
  (runId) => {
    const input = getQaToolRun(runId);
    return checkTraceabilityGap(input.roadmap ?? { items: [] }, input.normalizedData);
  },
);

const semanticContextSchema = z.object({
  initiativeId: z.string().optional(),
  skill: z.string(),
  referencedIds: z.array(z.string()),
  candidates: z.array(
    z.object({
      id: z.string(),
      requiredSkills: z.array(z.string()),
      description: z.string().optional(),
    }),
  ),
});
const semanticOutputSchema = z.object({
  exactMatchFindings: z.array(findingSchema),
  semanticContext: z.array(semanticContextSchema),
});

const bodAlignmentTool = defineAgentTool({
  id: QA_TOOL_IDS.bodAlignment,
  name: 'Analyze BOD alignment',
  description:
    'Return exact-match BOD findings plus goal descriptions and required skills so the agent can judge semantic alignment.',
  input: runInputSchema,
  output: semanticOutputSchema,
  execute: async ({ runId }) => {
    markQaToolCalled(runId, QA_TOOL_IDS.bodAlignment);
    const input = getQaToolRun(runId);
    const roadmap = input.roadmap ?? { items: [] };
    const result = {
      exactMatchFindings: serializeFindings(
        checkBodAlignment(roadmap, input.priorityResult, input.normalizedData),
      ),
      semanticContext: roadmap.items.map((item) => {
        const priority = input.priorityResult.initiatives.find(
          (initiative) => initiative.skill === item.skill,
        );
        const referencedIds = priority?.supporting_bod_goals ?? [];
        return {
          initiativeId: item.initiativeId,
          skill: item.skill,
          referencedIds,
          candidates: (input.normalizedData.bodGoals ?? [])
            .filter((goal) => referencedIds.includes(goal.id))
            .map((goal) => ({
              id: goal.id,
              requiredSkills: goal.requiredSkills ?? [],
              description: goal.description,
            })),
        };
      }),
    };
    recordQaToolResult(runId, QA_TOOL_IDS.bodAlignment, result);
    return result;
  },
});

const projectRequirementsTool = defineAgentTool({
  id: QA_TOOL_IDS.projectRequirements,
  name: 'Analyze project requirements',
  description:
    'Return exact-match project findings plus supporting project skill context for semantic requirement matching.',
  input: runInputSchema,
  output: semanticOutputSchema,
  execute: async ({ runId }) => {
    markQaToolCalled(runId, QA_TOOL_IDS.projectRequirements);
    const input = getQaToolRun(runId);
    const roadmap = input.roadmap ?? { items: [] };
    const result = {
      exactMatchFindings: serializeFindings(
        checkProjectRequirement(roadmap, input.priorityResult, input.normalizedData),
      ),
      semanticContext: roadmap.items.map((item) => {
        const priority = input.priorityResult.initiatives.find(
          (initiative) => initiative.skill === item.skill,
        );
        const referencedIds = priority?.supporting_projects ?? [];
        return {
          initiativeId: item.initiativeId,
          skill: item.skill,
          referencedIds,
          candidates: (input.normalizedData.projects ?? [])
            .filter((project) => referencedIds.includes(project.id))
            .map((project) => ({
              id: project.id,
              requiredSkills: project.requiredSkills ?? [],
              description: project.description,
            })),
        };
      }),
    };
    recordQaToolResult(runId, QA_TOOL_IDS.projectRequirements, result);
    return result;
  },
});

const scoreTool = defineAgentTool({
  id: QA_TOOL_IDS.score,
  name: 'Calculate QA score',
  description: 'Calculate the final deterministic QA score and risk level from final findings.',
  input: runInputSchema,
  output: z.object({
    score: z.number(),
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    reason: z.string(),
  }),
  execute: async ({ runId }) => {
    markQaToolCalled(runId, QA_TOOL_IDS.score);
    const findings = getQaFinalFindings(runId);
    const result = calculateQaScore(findings);
    recordQaScoreCall(runId, findings, result);
    return result;
  },
});

export const trainingRoadmapAgentTools: AgentTool[] = [
  invalidTraineesTool,
  trainerCapacityTool,
  missingEvidenceTool,
  bodAlignmentTool,
  projectRequirementsTool,
  traineeDesireTool,
  timelineTool,
  traceabilityTool,
  scoreTool,
  lndGetPendingSkills as unknown as AgentTool,
  lndFindAndAssignTrainer as unknown as AgentTool,
  lndAssignLearningFormats as unknown as AgentTool,
  lndCompileQuarterlyRoadmap as unknown as AgentTool,
];
