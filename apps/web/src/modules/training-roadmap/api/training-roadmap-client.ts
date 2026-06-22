import type { ApprovalDecision, ApprovalResponse, RoadmapResult } from '../types.ts';

export type TrainingRoadmapDataSource = 'api';

export type TrainingRoadmapClientResult<T> = {
  data: T;
  source: TrainingRoadmapDataSource;
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

export async function runTrainingRoadmap(
  userPrompt?: string,
): Promise<TrainingRoadmapClientResult<RoadmapResult>> {
  const generationResponse = await fetch('/api/training-roadmap/run', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userPrompt }),
  });
  const generated = await parseJsonOrThrow<{ runId?: unknown }>(
    generationResponse,
    'Failed to generate training roadmap',
  );
  if (typeof generated.runId !== 'string' || generated.runId.length === 0) {
    throw new Error('Agent 1 response is missing runId');
  }

  const response = await fetch('/api/training-roadmap/qa', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runId: generated.runId }),
  });
  const data = await parseJsonOrThrow<RoadmapResult>(
    response,
    'Failed to run training roadmap pipeline',
  );
  return { data, source: 'api' };
}

export async function submitReviewDecision(
  runId: string,
  decision: ApprovalDecision,
): Promise<TrainingRoadmapClientResult<ApprovalResponse>> {
  const response = await fetch('/api/training-roadmap/approve', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runId, decision }),
  });
  const data = await parseJsonOrThrow<ApprovalResponse>(
    response,
    'Failed to submit review decision',
  );
  return { data, source: 'api' };
}

export async function submitRevisionFeedback(
  runId: string,
  feedback: string,
): Promise<TrainingRoadmapClientResult<RoadmapResult>> {
  const feedbackResponse = await fetch('/api/training-roadmap/feedback', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runId, feedback }),
  });
  const regeneration = await parseJsonOrThrow<{ runId?: unknown }>(
    feedbackResponse,
    'Failed to regenerate the training roadmap',
  );
  if (regeneration.runId !== runId) {
    throw new Error('Regenerated roadmap response does not match the current run');
  }

  const qaResponse = await fetch('/api/training-roadmap/qa', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runId }),
  });
  const data = await parseJsonOrThrow<RoadmapResult>(
    qaResponse,
    'Failed to QA the regenerated training roadmap',
  );
  return { data, source: 'api' };
}
