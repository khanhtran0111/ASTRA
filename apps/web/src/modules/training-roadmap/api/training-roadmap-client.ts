import type {
  ApprovalDecision,
  ApprovalResponse,
  RoadmapExportProposal,
  RoadmapResult,
} from '../types.ts';

export type TrainingRoadmapDataSource = 'api';

export type TrainingRoadmapClientResult<T> = {
  data: T;
  source: TrainingRoadmapDataSource;
};

type PromptIntentMismatchBody = {
  error: string;
  code: 'PROMPT_INTENT_MISMATCH';
  detectedIntent: string;
  destination: 'AGENT_CHAT';
  targetPath: string;
};

export class TrainingRoadmapIntentHandoffError extends Error {
  readonly code = 'PROMPT_INTENT_MISMATCH';
  readonly detectedIntent: string;
  readonly targetPath: string;

  constructor(message: string, detectedIntent: string, targetPath: string) {
    super(message);
    this.name = 'TrainingRoadmapIntentHandoffError';
    this.detectedIntent = detectedIntent;
    this.targetPath = targetPath;
  }
}

async function parseJsonOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    let message = fallbackMessage;

    try {
      const body = (await response.json()) as {
        error?: unknown;
        message?: unknown;
        code?: unknown;
        detectedIntent?: unknown;
        destination?: unknown;
        targetPath?: unknown;
      };
      if (
        body.code === 'PROMPT_INTENT_MISMATCH' &&
        typeof body.error === 'string' &&
        typeof body.detectedIntent === 'string' &&
        body.destination === 'AGENT_CHAT' &&
        typeof body.targetPath === 'string'
      ) {
        const mismatch = body as PromptIntentMismatchBody;
        throw new TrainingRoadmapIntentHandoffError(
          mismatch.error,
          mismatch.detectedIntent,
          mismatch.targetPath,
        );
      }
      if (typeof body.error === 'string') message = body.error;
      if (typeof body.message === 'string') message = body.message;
    } catch (error) {
      if (error instanceof TrainingRoadmapIntentHandoffError) throw error;
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
  const data = await parseJsonOrThrow<RoadmapResult>(
    generationResponse,
    'Failed to run training roadmap pipeline',
  );
  return { data, source: 'api' };
}

export async function submitReviewDecision(
  runId: string,
  decision: ApprovalDecision,
  approvalNote?: string,
): Promise<TrainingRoadmapClientResult<ApprovalResponse>> {
  const response = await fetch('/api/training-roadmap/approve', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runId, decision, approvalNote }),
  });
  const data = await parseJsonOrThrow<ApprovalResponse>(
    response,
    'Failed to submit review decision',
  );
  return { data, source: 'api' };
}

export async function exportTrainingRoadmap(runId: string): Promise<RoadmapExportProposal> {
  const response = await fetch('/api/training-roadmap/export', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runId }),
  });
  return parseJsonOrThrow<RoadmapExportProposal>(response, 'Failed to export training roadmap');
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
  const data = await parseJsonOrThrow<RoadmapResult>(
    feedbackResponse,
    'Failed to regenerate the training roadmap',
  );
  if (data.runId !== runId) {
    throw new Error('Regenerated roadmap response does not match the current run');
  }
  return { data, source: 'api' };
}
