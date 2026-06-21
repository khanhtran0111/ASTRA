import fs from 'node:fs';
import { Agent } from '@mastra/core/agent';
import type { SessionEnv, StructuredAgentRuntime } from '@seta/core';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import type { ApprovalDecision, ApprovalResponse, Priority } from '../../types.ts';
import { lndCoordinatorSpec } from '../agent-specs/lnd-orchestrator-spec.ts';
import {
  lndAssignLearningFormats,
  lndCompileQuarterlyRoadmap,
  lndFindAndAssignTrainer,
  lndGetPendingSkills,
  MatchedTrainingClassesSchema,
} from '../agent-tools/roadmap-tools.ts';
import { generateDraftRoadmap } from '../domain/generate-roadmap.ts';
import { runTrainingRoadmapPipeline } from '../domain/pipeline.ts';
import type { RoadmapOutputAgent } from '../domain/qa/roadmap-output-loader.ts';
import { loadQaInputFromRoadmapOutput } from '../domain/qa/roadmap-output-loader.ts';
import type { DraftRoadmapOutput, MatchedTrainingClass } from '../domain/types.ts';
import { getScratchPath, readJsonFileOrDefault } from '../scratch-storage.ts';

const MATCHED_CLASSES_PATH = getScratchPath('matched_classes.json');
const ROADMAP_OUTPUT_PATH = getScratchPath('roadmap_output_agent.json');

const AgentSkillUpdatesSchema = z.object({
  estimatedHours: z.number().optional(),
  learningFormat: z
    .enum([
      'INTERNAL_TRAINING',
      'ON_JOB_TRAINING',
      'GROUP_STUDY',
      'EXTERNAL_TRAINER',
      'ONLINE_COURSE',
      'SEMINAR_SHARING',
    ])
    .optional(),
  formatExplanation: z.string().optional(),
  evaluationCriteria: z.string().optional(),
  durationWeeks: z.number().optional(),
});

const AgentSkillsResponseSchema = z.object({
  skills: z.record(z.string(), AgentSkillUpdatesSchema),
});

type AgentSkillUpdates = z.infer<typeof AgentSkillUpdatesSchema>;

function isApprovalDecision(value: unknown): value is ApprovalDecision {
  return value === 'approved' || value === 'revision_requested' || value === 'rejected';
}

async function readJsonBody(c: Context) {
  try {
    return (await c.req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function createRunId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}`;
}

function scoreToPriority(score: number): Priority {
  if (score >= 85) return 'P1';
  if (score >= 65) return 'P2';
  return 'P3';
}

function toAgentOneResult(classes: MatchedTrainingClass[]): RoadmapOutputAgent {
  return {
    runId: createRunId(),
    executionLog: [
      'Loaded internal trainer pool.',
      'Loaded scored training needs.',
      `Matched ${classes.length} training needs to trainers.`,
      `${classes.filter((item) => !item.isExternalRequired).length} assigned internally.`,
      `${classes.filter((item) => item.isExternalRequired).length} flagged for external resource.`,
      'Generated draft roadmap.',
      'Paused at Human Review Gate.',
    ],
    initiatives: classes.map((item) => {
      const format =
        item.learningFormat ?? (item.isExternalRequired ? 'EXTERNAL_TRAINER' : 'INTERNAL_TRAINING');

      return {
        id: item.classId,
        topic: item.skillName,
        priority: scoreToPriority(item.priorityScore),
        score: item.priorityScore,
        quarter: item.targetQuarter.replace('_', ' '),
        targetTrainees: item.trainees,
        trainerName: item.assignedTrainer,
        format,
        formatExplanation:
          item.formatExplanation ?? `Selected ${format} based on trainer availability.`,
        evaluationCriteria: item.evaluationCriteria,
        durationWeeks: item.durationWeeks,
        estimatedHours: item.estimatedHours,
        evidence: [
          ...item.evidence.bodGoals,
          ...item.evidence.projectIds,
          ...item.evidence.surveyIds,
        ],
        ...(item.fallbackReason ? { fallbackReason: item.fallbackReason } : {}),
      };
    }),
  };
}

async function runCoordinator(userPrompt: string): Promise<{
  source: RoadmapOutputAgent;
  agentReasoning: string;
  draftRoadmap: DraftRoadmapOutput;
}> {
  const agent = new Agent({
    id: 'lnd-coordinator',
    name: 'L&D Coordinator',
    instructions: lndCoordinatorSpec.instructions,
    model: {
      providerId: 'openai',
      modelId: 'gpt-4o',
    },
    tools: {
      lnd_getPendingSkills: lndGetPendingSkills,
      lnd_findAndAssignTrainer: lndFindAndAssignTrainer,
      lnd_assignLearningFormats: lndAssignLearningFormats,
      lnd_compileQuarterlyRoadmap: lndCompileQuarterlyRoadmap,
    } as never,
  });

  const prompt = `Please retrieve the pending skills. If the user specifies a target team or role, pass that as 'targetTeam' to lnd_getPendingSkills. This will filter P3 skills at the data level to only include those requested by the target team.
However, P1 and P2 skills (priorityScore >= 65) will NOT be filtered by the tool.

CRITICAL SEMANTIC FILTERING: You MUST semantically evaluate EVERY returned skill (P1, P2, AND P3) against the user's specific goal. If a skill is NOT DIRECTLY related to the user's stated goal or constraints, you MUST drop it. Only keep skills that are strictly and explicitly relevant.

CRITICAL TIMELINE FILTERING: If the user specifies a timeline constraint, you MUST drop ALL skills that do not match the requested timeframe.

CRITICAL KEY NAMING: The keys in your "skills" JSON output MUST be EXACTLY the original "skillName" string from lnd_getPendingSkills.

Once you have your final list of relevant skills, call lnd_findAndAssignTrainer with relevantSkills, targetTeam, and estimatedHoursMap. Estimate hours from intrinsic difficulty, not trainee count.

USER CONSTRAINTS AND PREFERENCES:
"${userPrompt || 'None specified'}"

Respect every user constraint. Return one complete markdown JSON code block with this shape:
{
  "skills": {
    "SkillName": {
      "estimatedHours": 40,
      "learningFormat": "ONLINE_COURSE",
      "formatExplanation": "Reasoning based on user constraints",
      "evaluationCriteria": "Criteria to evaluate success",
      "durationWeeks": 10
    }
  }
}
Do not use comments, ellipses, or truncated JSON. Do not call lnd_assignLearningFormats; output the JSON block.`;

  const response = await agent.generate(prompt);
  let extractedMap: Record<string, AgentSkillUpdates> = {};
  const jsonMatch = response.text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  let rawJson = jsonMatch?.[1] ?? response.text ?? '';

  if (!jsonMatch && rawJson.includes('```')) {
    rawJson = rawJson.replace(/```(?:json)?/g, '').replace(/```/g, '');
  }

  try {
    const parsed: unknown = JSON.parse(rawJson.trim());
    const result = AgentSkillsResponseSchema.safeParse(parsed);
    if (result.success) extractedMap = result.data.skills;
  } catch (error) {
    console.error('Failed to parse coordinator JSON output', error);
  }

  const parsedMatchedClasses = readJsonFileOrDefault(MATCHED_CLASSES_PATH, []);
  let matchedClasses: MatchedTrainingClass[] =
    MatchedTrainingClassesSchema.parse(parsedMatchedClasses);

  if (userPrompt && Object.keys(extractedMap).length > 0) {
    matchedClasses = matchedClasses.filter((item) =>
      Object.keys(extractedMap).some(
        (key) =>
          key === item.skillName || item.skillName.includes(key) || key.includes(item.skillName),
      ),
    );
  }

  for (const item of matchedClasses) {
    const key = Object.keys(extractedMap).find(
      (candidate) =>
        candidate === item.skillName ||
        item.skillName.includes(candidate) ||
        candidate.includes(item.skillName),
    );
    const updates = key ? extractedMap[key] : undefined;
    if (updates?.estimatedHours) item.estimatedHours = updates.estimatedHours;
    if (updates?.learningFormat) item.learningFormat = updates.learningFormat;
    if (updates?.formatExplanation) item.formatExplanation = updates.formatExplanation;
    if (updates?.evaluationCriteria) item.evaluationCriteria = updates.evaluationCriteria;
    if (updates?.durationWeeks) item.durationWeeks = updates.durationWeeks;
    if (!item.learningFormat) {
      item.learningFormat = item.isExternalRequired ? 'EXTERNAL_TRAINER' : 'INTERNAL_TRAINING';
    }
  }

  fs.writeFileSync(MATCHED_CLASSES_PATH, JSON.stringify(matchedClasses, null, 2));
  const draftRoadmap = generateDraftRoadmap(matchedClasses, 'RM-2026-V1');
  const source = toAgentOneResult(matchedClasses);

  fs.writeFileSync(
    ROADMAP_OUTPUT_PATH,
    JSON.stringify({ ...source, agentReasoning: response.text, draftRoadmap }, null, 2),
  );

  return { source, agentReasoning: response.text, draftRoadmap };
}

export function buildTrainingRoadmapRouteHandlers(deps: {
  agents: StructuredAgentRuntime;
}): Hono<SessionEnv> {
  const routes = new Hono<SessionEnv>();

  routes.get('/health', (c) => c.json({ ok: true, module: 'training-roadmap' }));

  routes.post('/run', async (c) => {
    const body = await readJsonBody(c);
    const userPrompt = typeof body.userPrompt === 'string' ? body.userPrompt : '';

    try {
      const result = await runCoordinator(userPrompt);
      return c.json({
        ...result.source,
        agentReasoning: result.agentReasoning,
        draftRoadmap: result.draftRoadmap,
      });
    } catch (error) {
      console.error('Coordinator agent execution error', error);
      return c.json({ error: String(error) }, 500);
    }
  });

  routes.post('/qa', async (c) => {
    try {
      const { source, qaInput } = await loadQaInputFromRoadmapOutput();
      const result = await runTrainingRoadmapPipeline({
        source,
        qaInput,
        agents: deps.agents,
        abortSignal: c.req.raw.signal,
        session: c.get('user'),
      });
      return c.json(result);
    } catch (error) {
      console.error('QA agent execution error', error);
      return c.json({ error: String(error) }, 500);
    }
  });

  routes.post('/approve', async (c) => {
    const body = await readJsonBody(c);

    if (typeof body.runId !== 'string' || body.runId.trim().length === 0) {
      return c.json({ error: 'runId is required' }, 400);
    }

    if (!isApprovalDecision(body.decision)) {
      return c.json({ error: 'Invalid decision' }, 400);
    }

    const response: ApprovalResponse = {
      runId: body.runId,
      reviewStatus: body.decision,
      approvalToken: body.decision === 'approved' ? `APPROVAL-${Date.now()}` : null,
    };

    return c.json(response);
  });

  return routes;
}
