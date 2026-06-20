import type { ApprovalDecision, ApprovalResponse, RoadmapResult } from '../types.ts';

export type TrainingRoadmapDataSource = 'api' | 'bundled-demo';

export type TrainingRoadmapClientResult<T> = {
  data: T;
  source: TrainingRoadmapDataSource;
};

const bundledRoadmapResult: RoadmapResult = {
  runId: 'demo-member1-snapshot',
  reviewStatus: 'pending',
  executionLog: [
    'Loaded the bundled Member 1 snapshot.',
    'Validated DS01–DS05 source status.',
    'Loaded normalized skill gaps and priority scores.',
    'Prepared the provisional roadmap contract for Member 2.',
    'QA validation completed with deterministic demo rules.',
    'Paused at Human Review Gate.',
  ],
  initiatives: [
    {
      id: 'DEMO-K8S',
      topic: 'Kubernetes Enablement',
      priority: 'P1',
      score: 98,
      quarter: 'Q3 2026 (provisional)',
      targetTrainees: ['12 employees'],
      trainerName: 'TRN-004 / TRN-009',
      format: 'internal',
      estimatedHours: 12,
      evidence: ['GOAL-2026-07', 'PRJ-002', 'PRJ-005', 'PRJ-007', 'PRJ-009'],
    },
    {
      id: 'DEMO-CICD',
      topic: 'CI/CD Delivery Practices',
      priority: 'P1',
      score: 90,
      quarter: 'Q3 2026 (provisional)',
      targetTrainees: ['14 employees'],
      trainerName: null,
      format: 'external',
      estimatedHours: 16,
      evidence: ['GOAL-2026-07', 'PRJ-005', 'PRJ-009'],
      fallbackReason: 'Member 1 data found no internal trainer; Member 2 will finalize matching.',
    },
    {
      id: 'DEMO-SYSTEM-DESIGN',
      topic: 'System Design Foundations',
      priority: 'P1',
      score: 80,
      quarter: 'Q3 2026 (provisional)',
      targetTrainees: ['24 employees'],
      trainerName: null,
      format: 'external',
      estimatedHours: 16,
      evidence: ['GOAL-2025-08', 'GOAL-2026-04'],
      fallbackReason: 'Trainer assignment is intentionally pending the Member 2 matching engine.',
    },
    {
      id: 'DEMO-AI-TOOLS',
      topic: 'Practical AI Tools',
      priority: 'P1',
      score: 80,
      quarter: 'Q3 2026 (provisional)',
      targetTrainees: ['21 employees'],
      trainerName: null,
      format: 'self-study',
      estimatedHours: 8,
      evidence: ['GOAL-2026-04', 'GOAL-2026-10'],
      fallbackReason: 'Trainer assignment is intentionally pending the Member 2 matching engine.',
    },
  ],
  qaFindings: [
    {
      id: 'DEMO-QA-001',
      risk: 'MEDIUM',
      message: 'Three P1 initiatives still require a trainer assignment or external fallback.',
    },
    {
      id: 'DEMO-QA-002',
      risk: 'LOW',
      message: 'All displayed priorities retain BOD, project, or survey evidence.',
    },
  ],
};

async function parseJsonOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    let message = fallbackMessage;

    try {
      const body = (await response.json()) as { error?: unknown; message?: unknown };
      if (typeof body.error === 'string') message = body.error;
      if (typeof body.message === 'string') message = body.message;
    } catch {
      // Keep the fallback message when the server did not return JSON.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function cloneBundledRoadmapResult(): RoadmapResult {
  return structuredClone(bundledRoadmapResult);
}

function canUseDemoFallback(response: Response): boolean {
  return (
    response.status === 404 ||
    response.status === 408 ||
    response.status === 429 ||
    response.status >= 500
  );
}

function isConnectionOrPayloadError(error: unknown): boolean {
  return error instanceof TypeError || error instanceof SyntaxError;
}

export async function runTrainingRoadmap(): Promise<TrainingRoadmapClientResult<RoadmapResult>> {
  try {
    const response = await fetch('/api/training-roadmap/run', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
    });

    if (canUseDemoFallback(response)) {
      return { data: cloneBundledRoadmapResult(), source: 'bundled-demo' };
    }

    const data = await parseJsonOrThrow<RoadmapResult>(
      response,
      'Failed to run training roadmap pipeline',
    );
    return { data, source: 'api' };
  } catch (error) {
    if (!isConnectionOrPayloadError(error)) throw error;
    return { data: cloneBundledRoadmapResult(), source: 'bundled-demo' };
  }
}

export async function submitReviewDecision(
  runId: string,
  decision: ApprovalDecision,
): Promise<TrainingRoadmapClientResult<ApprovalResponse>> {
  const fallback: ApprovalResponse = {
    runId,
    reviewStatus: decision,
    approvalToken: decision === 'approved' ? `DEMO-APPROVAL-${runId}` : null,
  };

  try {
    const response = await fetch('/api/training-roadmap/approve', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId, decision }),
    });

    if (canUseDemoFallback(response)) {
      return { data: fallback, source: 'bundled-demo' };
    }

    const data = await parseJsonOrThrow<ApprovalResponse>(
      response,
      'Failed to submit review decision',
    );
    return { data, source: 'api' };
  } catch (error) {
    if (!isConnectionOrPayloadError(error)) throw error;
    return { data: fallback, source: 'bundled-demo' };
  }
}
