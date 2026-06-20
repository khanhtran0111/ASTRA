import type { SessionEnv, StructuredAgentRuntime } from '@seta/core';
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { ApprovalDecision, ApprovalResponse } from '../../types.ts';
import { runTrainingRoadmapPipeline } from '../domain/pipeline.ts';
import { loadQaInputFromRoadmapOutput } from '../domain/qa/roadmap-output-loader.ts';

export function buildTrainingRoadmapRouteHandlers(deps: {
  agents: StructuredAgentRuntime;
}): Hono<SessionEnv> {
  const routes = new Hono<SessionEnv>();

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

  routes.get('/health', (c) => {
    return c.json({
      ok: true,
      module: 'training-roadmap',
    });
  });

  routes.post('/run', async (c) => {
    const { source, qaInput } = await loadQaInputFromRoadmapOutput();
    const result = await runTrainingRoadmapPipeline({
      source,
      qaInput,
      agents: deps.agents,
      abortSignal: c.req.raw.signal,
      session: c.get('user'),
    });
    return c.json(result);
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
