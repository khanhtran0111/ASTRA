import type { Context } from 'hono';
import { Hono } from 'hono';
import type { ApprovalDecision, ApprovalResponse } from '../../types.ts';
import { runMockTrainingRoadmapPipeline } from '../domain/mock-pipeline.ts';

export const trainingRoadmapRoutes = new Hono();

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

trainingRoadmapRoutes.get('/health', (c) => {
  return c.json({
    ok: true,
    module: 'training-roadmap',
  });
});

trainingRoadmapRoutes.post('/run', async (c) => {
  const result = await runMockTrainingRoadmapPipeline();
  return c.json(result);
});

trainingRoadmapRoutes.post('/approve', async (c) => {
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
