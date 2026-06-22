import fs from 'node:fs';
import { Agent } from '@mastra/core/agent';
import type { SessionEnv, StructuredAgentRuntime } from '@seta/core';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import type {
  ApprovalDecision,
  ApprovalResponse,
  HumanFeedback,
  Priority,
  RoadmapResult,
  RoadmapVersion,
} from '../../types.ts';
import { lndCoordinatorSpec } from '../agent-specs/lnd-orchestrator-spec.ts';
import {
  lndAssignLearningFormats,
  lndCompileQuarterlyRoadmap,
  lndFindAndAssignTrainer,
  lndGetPendingSkills,
  MatchedTrainingClassesSchema,
} from '../agent-tools/roadmap-tools.ts';
import { buildExportProposal } from '../domain/export-proposal.ts';
import { generateDraftRoadmap } from '../domain/generate-roadmap.ts';
import { runTrainingRoadmapPipeline } from '../domain/pipeline.ts';
import type { RoadmapOutputAgent } from '../domain/qa/roadmap-output-loader.ts';
import { loadQaInputFromRoadmapOutput } from '../domain/qa/roadmap-output-loader.ts';
import { reviseRoadmap } from '../domain/revise-roadmap.ts';
import type { MatchedTrainingClass } from '../domain/types.ts';
import {
  getActiveRunScratchPath,
  getRunScratchPath,
  readJsonFileOrDefault,
  withTrainingRoadmapRun,
} from '../scratch-storage.ts';

const AgentSkillUpdatesSchema = z.object({
  objective: z.string().min(1),
  prerequisites: z.array(z.string()),
  estimatedHours: z.number().positive(),
  learningFormat: z.enum([
    'INTERNAL_TRAINING',
    'ON_JOB_TRAINING',
    'GROUP_STUDY',
    'EXTERNAL_TRAINER',
    'ONLINE_COURSE',
    'SEMINAR_SHARING',
  ]),
  formatExplanation: z.string().min(1),
  evaluationCriteria: z.string().min(1),
  durationWeeks: z.number().int().positive(),
  startWeek: z.number().int().min(1).max(13),
  endWeek: z.number().int().min(1).max(13),
});

const AgentSkillsResponseSchema = z.object({
  skills: z.array(
    AgentSkillUpdatesSchema.extend({
      skillName: z.string().min(1),
    }),
  ),
});

type AgentSkillUpdates = z.infer<typeof AgentSkillUpdatesSchema>;

function isApprovalDecision(value: unknown): value is ApprovalDecision {
  return (
    value === 'approved' ||
    value === 'approved_with_risks' ||
    value === 'revision_requested' ||
    value === 'rejected'
  );
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

function formatPreviousRoadmapSummary(previousRoadmap: RoadmapOutputAgent): string {
  const rows = previousRoadmap.initiatives.map((initiative) => {
    const trainerTag = initiative.trainerName ? `${initiative.trainerName}` : 'unassigned';
    const timeline = initiative.timeline
      ? `weeks ${initiative.timeline.startWeek}-${initiative.timeline.endWeek}`
      : initiative.quarter;
    return `- ${initiative.topic} (${initiative.priority}) | ${trainerTag} | ${timeline}`;
  });
  return rows.slice(0, 12).join('\n') + (rows.length > 12 ? '\n- ...more initiatives omitted' : '');
}

function saveHumanFeedback(
  runId: string,
  feedback: string,
  reviewerId?: string | null,
): HumanFeedback {
  const payload: HumanFeedback = {
    runId,
    feedback,
    createdAt: new Date().toISOString(),
    reviewerId: reviewerId ?? null,
  };
  fs.mkdirSync(getRunScratchPath(runId), { recursive: true });
  fs.writeFileSync(
    getRunScratchPath(runId, 'human_feedback.json'),
    JSON.stringify(payload, null, 2),
  );
  return payload;
}

function resolveRoadmapOutputPath(runId: string): string | null {
  const configured = process.env.TRAINING_ROADMAP_OUTPUT_FILE;
  const scratchPath = getRunScratchPath(runId, 'roadmap_output_agent.json');
  if (fs.existsSync(scratchPath)) {
    return scratchPath;
  }
  if (typeof configured === 'string' && configured.trim().length > 0 && fs.existsSync(configured)) {
    return configured;
  }
  return null;
}

function normalizeInitiativeFormat(format: string): RoadmapResult['initiatives'][number]['format'] {
  if (format === 'EXTERNAL_TRAINER') return 'external';
  if (format === 'GROUP_STUDY' || format === 'ONLINE_COURSE') return 'self-study';
  return 'internal';
}

function saveRoadmapVersion(runId: string, roadmap: RoadmapResult, feedback?: string): void {
  const versionDir = getRunScratchPath(runId, 'versions');
  fs.mkdirSync(versionDir, { recursive: true });
  const existing = fs.readdirSync(versionDir).filter((name) => name.endsWith('.json'));
  const version = existing.length + 1;
  const roadmapVersion: RoadmapVersion = {
    runId,
    version,
    feedback,
    roadmap,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    getRunScratchPath(runId, 'versions', `version-${version}.json`),
    JSON.stringify(roadmapVersion, null, 2),
  );
}

function scoreToPriority(score: number): Priority {
  if (score >= 85) return 'P1';
  if (score >= 65) return 'P2';
  return 'P3';
}

function toAgentOneResult(
  classes: MatchedTrainingClass[],
  runId: string,
  userPrompt: string,
): RoadmapOutputAgent {
  return {
    runId,
    request: { userPrompt },
    executionLog: [
      'Loaded internal trainer pool.',
      'Loaded scored training needs.',
      `Matched ${classes.length} training needs to trainers.`,
      `${classes.filter((item) => !item.isExternalRequired).length} assigned internally.`,
      `${classes.filter((item) => item.isExternalRequired).length} flagged for external resource.`,
      'Generated draft roadmap.',
      'Paused at Human Review Gate.',
    ],
    revisionCount: 0,
    revisionHistory: [],
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
        objective: item.objective,
        prerequisites: item.prerequisites,
        format,
        formatExplanation:
          item.formatExplanation ?? `Selected ${format} based on trainer availability.`,
        evaluationCriteria: item.evaluationCriteria,
        durationWeeks: item.durationWeeks,
        timeline:
          item.startWeek && item.endWeek
            ? { startWeek: item.startWeek, endWeek: item.endWeek }
            : undefined,
        estimatedHours: item.estimatedHours,
        evidence: item.evidenceRefs ?? [],
      };
    }),
  };
}

async function runCoordinator(
  userPrompt: string,
  options?: {
    runId?: string;
    previousRoadmap?: RoadmapOutputAgent;
    feedback?: string;
  },
): Promise<{
  source: RoadmapOutputAgent;
  agentReasoning: string;
  draftRoadmap: unknown;
}> {
  const runId = options?.runId ?? createRunId();
  const effectiveUserPrompt = options?.previousRoadmap?.request?.userPrompt ?? userPrompt;

  return withTrainingRoadmapRun(runId, async () => {
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

    let prompt = `Please retrieve the pending skills. Extract and pass every scope constraint supplied by the user:
- target team or role as "targetTeam"
- proficiency such as Mid-level/Intermediate as "targetProficiency"
- requested quarter such as Q3/2026 as "targetQuarter" using Q3_2026 format

These filters apply to every priority tier and every trainee. Never add employees merely to reach a requested headcount.

CRITICAL SEMANTIC FILTERING: You MUST semantically evaluate EVERY returned skill (P1, P2, AND P3) against the user's specific goal. If a skill is NOT DIRECTLY related to the user's stated goal or constraints, you MUST drop it. Only keep skills that are strictly and explicitly relevant.

CAPABILITY COVERAGE: Account for every capability explicitly requested by the user and keep every returned skill that is a direct match or clear synonym, not only the highest-scoring match. For example, "frontend testing" is covered by "Automation Testing". If no returned skill has evidence for a requested capability, omit that capability rather than inventing a skill.

CRITICAL TIMELINE FILTERING: If the user specifies a timeline constraint, you MUST drop ALL skills that do not match the requested timeframe.

CRITICAL KEY NAMING: The keys in your "skills" JSON output MUST be EXACTLY the original "skillName" string from lnd_getPendingSkills.

Once you have your final list of relevant skills, call lnd_findAndAssignTrainer with relevantSkills, targetTeam, targetProficiency, targetQuarter, and estimatedHoursMap. Estimate hours from intrinsic difficulty, not trainee count.

USER CONSTRAINTS AND PREFERENCES:
"${effectiveUserPrompt || 'None specified'}"

Respect every user constraint. Return structured data with this shape:
{
  "skills": [
    {
      "skillName": "SkillName",
      "estimatedHours": 40,
      "objective": "Observable capability gained by the cohort",
      "prerequisites": ["Required baseline skill"],
      "learningFormat": "ONLINE_COURSE",
      "formatExplanation": "Reasoning based on user constraints",
      "evaluationCriteria": "Criteria to evaluate success",
      "durationWeeks": 10,
      "startWeek": 1,
      "endWeek": 10
    }
  ]
}
Do not call lnd_assignLearningFormats.`;

    if (options?.feedback) {
      prompt += `\n\nThe previous roadmap received the following reviewer feedback:\n\n${options.feedback
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `- ${line}`)
        .join(
          '\n',
        )}\n\nRegenerate the roadmap while preserving valid initiatives and applying the requested changes when possible.`;
    }

    if (options?.previousRoadmap) {
      prompt += `\n\nPrevious roadmap summary:\n${formatPreviousRoadmapSummary(options.previousRoadmap)}`;
    }

    const response = await agent.generate(prompt, {
      maxSteps: 8,
      structuredOutput: { schema: AgentSkillsResponseSchema },
    });
    const structuredResponse = AgentSkillsResponseSchema.parse(response.object);
    const extractedMap: Record<string, AgentSkillUpdates> = {};
    for (const selection of structuredResponse.skills) {
      if (extractedMap[selection.skillName]) {
        throw new Error(`Coordinator returned duplicate skill ${selection.skillName}`);
      }
      const { skillName, ...updates } = selection;
      extractedMap[skillName] = updates;
    }
    for (const [skill, updates] of Object.entries(extractedMap)) {
      if (updates.endWeek < updates.startWeek) {
        throw new Error(`Coordinator returned an invalid week range for ${skill}`);
      }
    }
    const agentReasoning = response.text || JSON.stringify(structuredResponse, null, 2);

    fs.writeFileSync(
      getActiveRunScratchPath('coordinator_response.json'),
      JSON.stringify({ text: response.text, object: structuredResponse }, null, 2),
    );

    const parsedMatchedClasses = readJsonFileOrDefault(
      getActiveRunScratchPath('matched_classes.json'),
      [],
    );
    let matchedClasses: MatchedTrainingClass[] =
      MatchedTrainingClassesSchema.parse(parsedMatchedClasses);

    const relevantSkills = new Set(Object.keys(extractedMap));
    if (userPrompt.trim() && relevantSkills.size === 0) {
      throw new Error('Coordinator returned no valid scope-aligned skills for the user prompt');
    }

    const matchedSkillNames = new Set(matchedClasses.map((item) => item.skillName));
    const matchingWasOutOfScope = matchedClasses.some(
      (item) => !relevantSkills.has(item.skillName),
    );
    const requestedSkillWasNotMatched = [...relevantSkills].some(
      (skill) => !matchedSkillNames.has(skill),
    );
    if (matchingWasOutOfScope || requestedSkillWasNotMatched) {
      throw new Error(
        'Coordinator trainer matching did not use the exact scope-aligned skill selection',
      );
    }

    matchedClasses = matchedClasses.filter((item) => relevantSkills.has(item.skillName));
    if (matchedClasses.length === 0) {
      throw new Error('Coordinator produced no evidence-backed training initiatives');
    }

    for (const item of matchedClasses) {
      const updates = extractedMap[item.skillName];
      if (updates?.objective) item.objective = updates.objective;
      if (updates?.prerequisites) item.prerequisites = updates.prerequisites;
      if (updates?.estimatedHours) item.estimatedHours = updates.estimatedHours;
      if (updates?.learningFormat) item.learningFormat = updates.learningFormat;
      if (updates?.formatExplanation) item.formatExplanation = updates.formatExplanation;
      if (updates?.evaluationCriteria) item.evaluationCriteria = updates.evaluationCriteria;
      if (updates?.durationWeeks) item.durationWeeks = updates.durationWeeks;
      if (updates?.startWeek) item.startWeek = updates.startWeek;
      if (updates?.endWeek) item.endWeek = updates.endWeek;
      if (!item.learningFormat) {
        item.learningFormat = item.isExternalRequired ? 'EXTERNAL_TRAINER' : 'INTERNAL_TRAINING';
      }
    }

    fs.writeFileSync(
      getActiveRunScratchPath('matched_classes.json'),
      JSON.stringify(matchedClasses, null, 2),
    );
    const draftRoadmap = generateDraftRoadmap(matchedClasses, 'RM-2026-V1');
    const source = toAgentOneResult(matchedClasses, runId, userPrompt);

    fs.writeFileSync(
      getActiveRunScratchPath('roadmap_output_agent.json'),
      JSON.stringify({ ...source, agentReasoning, draftRoadmap }, null, 2),
    );

    return { source, agentReasoning, draftRoadmap };
  });
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

      if (
        error instanceof Error &&
        (error.message.startsWith('Coordinator returned no valid scope-aligned skills') ||
          error.message.startsWith('Coordinator produced no evidence-backed') ||
          error.message.startsWith('Coordinator trainer matching did not use'))
      ) {
        return c.json({ error: error.message }, 422);
      }

      return c.json({ error: String(error) }, 500);
    }
  });

  routes.post('/feedback', async (c) => {
    const body = await readJsonBody(c);
    const runId = typeof body.runId === 'string' ? body.runId.trim() : '';
    const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';

    if (!runId) {
      return c.json({ error: 'runId is required' }, 400);
    }
    if (!feedback) {
      return c.json({ error: 'feedback is required' }, 400);
    }

    try {
      const sourcePath = resolveRoadmapOutputPath(runId);
      if (!sourcePath) {
        return c.json({ error: 'Agent 1 run not found' }, 404);
      }
      const source = readJsonFileOrDefault(sourcePath, null);
      if (!source || typeof source !== 'object' || !('runId' in source)) {
        return c.json({ error: 'Agent 1 run not found' }, 404);
      }
      const previousRoadmap = source as RoadmapOutputAgent;
      if (previousRoadmap.runId !== runId) {
        return c.json(
          { error: `Agent 1 artifact belongs to run ${previousRoadmap.runId}, not ${runId}` },
          409,
        );
      }

      const qaResult = readJsonFileOrDefault(getRunScratchPath(runId, 'qa_result.json'), null);
      if (
        qaResult &&
        typeof qaResult === 'object' &&
        'reviewStatus' in qaResult &&
        qaResult.reviewStatus !== 'pending_review' &&
        qaResult.reviewStatus !== 'blocked'
      ) {
        return c.json({ error: `Run ${runId} is already ${qaResult.reviewStatus}` }, 409);
      }

      saveHumanFeedback(runId, feedback, c.get('user')?.user_id);

      const result = await runCoordinator('', {
        runId,
        previousRoadmap,
        feedback,
      });

      fs.writeFileSync(
        getRunScratchPath(result.source.runId, 'roadmap_output_agent.json'),
        JSON.stringify(
          {
            ...result.source,
            agentReasoning: result.agentReasoning,
            draftRoadmap: result.draftRoadmap,
          },
          null,
          2,
        ),
      );
      saveRoadmapVersion(
        result.source.runId,
        {
          runId: result.source.runId,
          reviewStatus: 'pending_review',
          executionLog: result.source.executionLog,
          initiatives: result.source.initiatives.map((initiative) => ({
            id: initiative.id,
            topic: initiative.topic,
            priority: initiative.priority,
            score: initiative.score,
            quarter: initiative.quarter,
            targetTrainees: initiative.targetTrainees,
            trainerName: initiative.trainerName,
            objective: initiative.objective,
            prerequisites: initiative.prerequisites,
            format: normalizeInitiativeFormat(initiative.format),
            formatExplanation: initiative.formatExplanation,
            evaluationCriteria: initiative.evaluationCriteria,
            durationWeeks: initiative.durationWeeks,
            timeline: initiative.timeline,
            estimatedHours: initiative.estimatedHours,
            evidence: initiative.evidence,
            riskFlags: [],
          })),
          qaDecision: 'REVISE_REQUIRED',
          qaFindings: [],
          blockingIssues: [],
          revisionInstructions: [],
          approvalRequirement: 'NONE',
          qaSummary: 'Regeneration in progress',
          qaScore: 0,
          riskLevel: 'LOW',
          riskReason: 'Regeneration in progress',
          revisionCount: 0,
          evidencePack: {},
          reviewPack: {
            request: previousRoadmap.request ?? { userPrompt: '' },
            generatedAt: new Date().toISOString(),
            initiativeCount: result.source.initiatives.length,
            semanticSummary: [],
            findings: [],
          },
        },
        feedback,
      );

      return c.json({ runId, status: 'reprocessing' });
    } catch (error) {
      console.error('Feedback handling error', error);
      return c.json({ error: String(error) }, 500);
    }
  });

  routes.post('/qa', async (c) => {
    const body = await readJsonBody(c);

    if (typeof body.runId !== 'string' || body.runId.trim().length === 0) {
      return c.json({ error: 'runId is required' }, 400);
    }

    try {
      let { source, qaInput } = await loadQaInputFromRoadmapOutput(body.runId);
      let result: RoadmapResult;

      while (true) {
        result = await runTrainingRoadmapPipeline({
          source,
          qaInput,
          agents: deps.agents,
          abortSignal: c.req.raw.signal,
          session: c.get('user'),
        });

        if (result.qaDecision !== 'REVISE_REQUIRED' || source.revisionCount >= 2) break;

        source = reviseRoadmap(source, result.revisionInstructions);

        fs.writeFileSync(
          getRunScratchPath(source.runId, 'roadmap_output_agent.json'),
          JSON.stringify(source, null, 2),
        );

        ({ source, qaInput } = await loadQaInputFromRoadmapOutput(body.runId));
      }

      fs.writeFileSync(
        getRunScratchPath(result.runId, 'qa_result.json'),
        JSON.stringify(result, null, 2),
      );

      return c.json(result);
    } catch (error) {
      console.error('QA agent execution error', error);

      if (error instanceof Error && error.message.startsWith('Agent 1 artifact belongs to run ')) {
        return c.json({ error: error.message }, 409);
      }

      if (error instanceof Error && error.message.startsWith('QA input file not found.')) {
        return c.json({ error: 'Agent 1 run not found' }, 404);
      }

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

    const qaResultPath = getRunScratchPath(body.runId, 'qa_result.json');
    const qaResult = readJsonFileOrDefault(qaResultPath, null);

    if (!qaResult || typeof qaResult !== 'object') {
      return c.json({ error: 'QA run not found' }, 404);
    }

    if (!('reviewPack' in qaResult)) {
      return c.json({ error: 'Review Pack is required before approval' }, 409);
    }

    if (!('runId' in qaResult) || qaResult.runId !== body.runId) {
      return c.json({ error: 'QA runId does not match the approval request' }, 409);
    }

    if (!('reviewStatus' in qaResult) || !('qaDecision' in qaResult)) {
      return c.json({ error: 'QA result is missing decision state' }, 409);
    }

    if (qaResult.reviewStatus !== 'pending_review' && qaResult.reviewStatus !== 'blocked') {
      return c.json({ error: 'QA run is no longer pending review' }, 409);
    }

    const allowedDecisions =
      qaResult.qaDecision === 'PASS'
        ? new Set<ApprovalDecision>(['approved', 'revision_requested', 'rejected'])
        : qaResult.qaDecision === 'PASS_WITH_WARNINGS'
          ? new Set<ApprovalDecision>(['approved_with_risks', 'revision_requested', 'rejected'])
          : qaResult.qaDecision === 'REVISE_REQUIRED'
            ? new Set<ApprovalDecision>(['revision_requested'])
            : new Set<ApprovalDecision>(['revision_requested', 'rejected']);

    if (!allowedDecisions.has(body.decision)) {
      return c.json(
        { error: `${body.decision} is not allowed when QA decision is ${qaResult.qaDecision}` },
        409,
      );
    }

    const approvalNotes = typeof body.approvalNote === 'string' ? body.approvalNote.trim() : '';

    if (body.decision === 'approved_with_risks' && !approvalNotes) {
      return c.json({ error: 'Approval note is required for approve-with-risks' }, 400);
    }

    const approvalToken =
      body.decision === 'approved' || body.decision === 'approved_with_risks'
        ? `APPROVAL-${body.runId}-${Date.now()}`
        : null;

    const approvedAt = approvalToken ? new Date().toISOString() : undefined;
    const approvedBy = approvalToken ? c.get('user')?.user_id : undefined;

    const response: ApprovalResponse = {
      runId: body.runId,
      reviewStatus: body.decision,
      approvalToken,
      ...(approvalNotes ? { approvalNotes } : {}),
      ...(approvedBy ? { approvedBy } : {}),
      ...(approvedAt ? { approvedAt } : {}),
    };

    fs.writeFileSync(qaResultPath, JSON.stringify({ ...qaResult, ...response }, null, 2));

    return c.json(response);
  });

  routes.post('/export', async (c) => {
    const body = await readJsonBody(c);

    if (typeof body.runId !== 'string' || body.runId.trim().length === 0) {
      return c.json({ error: 'runId is required' }, 400);
    }

    const qaResult = readJsonFileOrDefault(getRunScratchPath(body.runId, 'qa_result.json'), null);

    if (!qaResult || typeof qaResult !== 'object') {
      return c.json({ error: 'QA run not found' }, 404);
    }

    try {
      return c.json(buildExportProposal(qaResult as RoadmapResult));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 409);
    }
  });

  return routes;
}
