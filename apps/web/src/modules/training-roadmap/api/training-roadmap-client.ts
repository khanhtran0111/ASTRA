import type { ApprovalDecision, ApprovalResponse, RoadmapResult } from '../types.ts';

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

export async function runTrainingRoadmap(): Promise<RoadmapResult> {
  const response = await fetch('/api/training-roadmap/run', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
  });

  return parseJsonOrThrow<RoadmapResult>(response, 'Failed to run training roadmap pipeline');
}

export async function submitReviewDecision(
  runId: string,
  decision: ApprovalDecision,
): Promise<ApprovalResponse> {
  const response = await fetch('/api/training-roadmap/approve', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runId, decision }),
  });

  return parseJsonOrThrow<ApprovalResponse>(response, 'Failed to submit review decision');
}
