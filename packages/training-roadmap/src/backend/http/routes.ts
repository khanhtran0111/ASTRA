import fs from 'node:fs';
import type { SessionEnv, StructuredAgentRuntime } from '@seta/core';
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { ApprovalDecision, ApprovalResponse, RoadmapResult } from '../../types.ts';
import {
  executeTrainingRoadmapRun,
  TrainingRoadmapRunError,
} from '../domain/execute-training-roadmap-run.ts';
import { buildExportProposal } from '../domain/export-proposal.ts';
import { runTrainingRoadmapPipeline } from '../domain/pipeline.ts';
import type { RoadmapOutputAgent } from '../domain/qa/roadmap-output-loader.ts';
import { loadQaInputFromRoadmapOutput } from '../domain/qa/roadmap-output-loader.ts';
import { getRunScratchPath, readJsonFileOrDefault } from '../scratch-storage.ts';

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

export function buildTrainingRoadmapRouteHandlers(deps: {
  agents: StructuredAgentRuntime;
}): Hono<SessionEnv> {
  const routes = new Hono<SessionEnv>();

  routes.get('/health', (c) => c.json({ ok: true, module: 'training-roadmap' }));

  routes.post('/run', async (c) => {
    const body = await readJsonBody(c);
    const userPrompt = typeof body.userPrompt === 'string' ? body.userPrompt : '';
    const runId = createRunId();

    try {
      const result = await executeTrainingRoadmapRun({
        runId,
        userPrompt,
        agents: deps.agents,
        abortSignal: c.req.raw.signal,
        session: c.get('user'),
      });
      return c.json(result);
    } catch (error) {
      console.error('Training roadmap run execution error', error);
      if (error instanceof TrainingRoadmapRunError) {
        return c.json(
          { error: error.message, code: error.code, runId },
          error.code === 'TRAINING_DATA_UNAVAILABLE' ? 503 : 422,
        );
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

      const userPrompt =
        (previousRoadmap.request?.userPrompt ?? '').split('\n\nReviewer feedback:\n')[0] ?? '';
      const result = await executeTrainingRoadmapRun({
        runId,
        userPrompt,
        agents: deps.agents,
        abortSignal: c.req.raw.signal,
        session: c.get('user'),
        feedback,
        reviewerId: c.get('user')?.user_id,
        previousSource: previousRoadmap,
      });
      return c.json(result);
    } catch (error) {
      console.error('Feedback handling error', error);
      if (error instanceof TrainingRoadmapRunError) {
        return c.json(
          { error: error.message, code: error.code, runId },
          error.code === 'TRAINING_DATA_UNAVAILABLE' ? 503 : 422,
        );
      }
      return c.json({ error: String(error) }, 500);
    }
  });

  routes.post('/qa', async (c) => {
    const body = await readJsonBody(c);

    if (typeof body.runId !== 'string' || body.runId.trim().length === 0) {
      return c.json({ error: 'runId is required' }, 400);
    }

    try {
      const { source, qaInput } = await loadQaInputFromRoadmapOutput(body.runId);
      const result: RoadmapResult = await runTrainingRoadmapPipeline({
        source,
        qaInput,
        agents: deps.agents,
        abortSignal: c.req.raw.signal,
        session: c.get('user'),
      });

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
