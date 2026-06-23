import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SessionScope, StructuredAgentRuntime } from '@seta/core';
import type { HumanFeedback, RoadmapResult, RoadmapVersion } from '../../types.ts';
import { getRunScratchPath, withTrainingRoadmapRun } from '../scratch-storage.ts';
import { defaultTrainingDataDir, runDataDrivenCoordinator } from './data-driven-pipeline.ts';
import { runTrainingRoadmapPipeline, toTrainingInitiatives } from './pipeline.ts';
import type { RoadmapOutputAgent } from './qa/roadmap-output-loader.ts';
import { loadQaInputFromRoadmapOutput } from './qa/roadmap-output-loader.ts';
import { reviseRoadmap } from './revise-roadmap.ts';
import {
  buildTrainingRoadmapPrompt,
  toDraftRoadmapOutput,
  toRoadmapOutputAgent,
} from './to-roadmap-output-agent.ts';

export class TrainingRoadmapRunError extends Error {
  constructor(
    readonly code: 'NO_EVIDENCE_BACKED_INITIATIVES',
    message: string,
  ) {
    super(message);
    this.name = 'TrainingRoadmapRunError';
  }
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function nextVersion(runId: string): Promise<number> {
  const versionDirectory = getRunScratchPath(runId, 'versions');
  await mkdir(versionDirectory, { recursive: true });
  const files = await readdir(versionDirectory);
  const highest = files.reduce((max, fileName) => {
    const match = /^version-(\d+)\.json$/.exec(fileName);
    return match ? Math.max(max, Number.parseInt(match[1] ?? '0', 10)) : max;
  }, 0);
  return highest + 1;
}

async function saveRoadmapVersion(
  runId: string,
  roadmap: RoadmapResult,
  feedback?: string,
): Promise<void> {
  const version = await nextVersion(runId);
  const payload: RoadmapVersion = {
    runId,
    version,
    ...(feedback?.trim() ? { feedback: feedback.trim() } : {}),
    roadmap,
    createdAt: new Date().toISOString(),
  };
  await writeJsonAtomic(getRunScratchPath(runId, 'versions', `version-${version}.json`), payload);
}

/**
 * Canonical controller for the POC. Agent 1 and QA communicate only through
 * the run-scoped artifact; the controller owns retries and persistence.
 */
export async function executeTrainingRoadmapRun(args: {
  runId: string;
  userPrompt: string;
  agents: StructuredAgentRuntime;
  abortSignal?: AbortSignal;
  session?: SessionScope;
  feedback?: string;
  reviewerId?: string | null;
  previousSource?: RoadmapOutputAgent;
  maxQaRevisions?: number;
  dataDir?: string;
  autoRevisionEnabled?: boolean;
}): Promise<RoadmapResult> {
  const maxQaRevisions = args.maxQaRevisions ?? 2;
  if (!Number.isInteger(maxQaRevisions) || maxQaRevisions < 0) {
    throw new Error('maxQaRevisions must be a non-negative integer');
  }
  const dataDir = args.dataDir ?? defaultTrainingDataDir();
  const autoRevisionEnabled =
    args.autoRevisionEnabled ?? process.env.TRAINING_ROADMAP_AUTO_REVISION === 'true';
  const prompt = buildTrainingRoadmapPrompt(args.userPrompt, args.feedback);
  if (args.previousSource && args.previousSource.runId !== args.runId) {
    throw new Error(
      `Previous Agent 1 artifact belongs to run ${args.previousSource.runId}, not ${args.runId}`,
    );
  }

  return withTrainingRoadmapRun(args.runId, async () => {
    if (args.feedback?.trim()) {
      const humanFeedback: HumanFeedback = {
        runId: args.runId,
        feedback: args.feedback.trim(),
        createdAt: new Date().toISOString(),
        reviewerId: args.reviewerId ?? null,
      };
      await writeJsonAtomic(getRunScratchPath(args.runId, 'human_feedback.json'), humanFeedback);
    }
    const snapshot = runDataDrivenCoordinator({
      dataDir,
      runId: args.runId,
      userPrompt: prompt,
    });
    if (snapshot.roadmap.initiatives.length === 0) {
      throw new TrainingRoadmapRunError(
        'NO_EVIDENCE_BACKED_INITIATIVES',
        'The data-first coordinator produced no evidence-backed training initiatives.',
      );
    }

    let source = toRoadmapOutputAgent({
      snapshot,
      userPrompt: args.userPrompt,
      ...(args.feedback ? { feedback: args.feedback } : {}),
      ...(args.previousSource ? { previousSource: args.previousSource } : {}),
    });
    const draftSource = structuredClone(source);
    const draftRoadmap = toDraftRoadmapOutput(snapshot);
    const artifactPath = getRunScratchPath(args.runId, 'roadmap_output_agent.json');
    await writeJsonAtomic(artifactPath, source);

    let { qaInput } = await loadQaInputFromRoadmapOutput(args.runId, { dataDir });
    let result = await runTrainingRoadmapPipeline({
      source,
      qaInput,
      agents: args.agents,
      abortSignal: args.abortSignal,
      session: args.session,
    });

    while (
      autoRevisionEnabled &&
      result.qaDecision === 'REVISE_REQUIRED' &&
      source.revisionCount < maxQaRevisions
    ) {
      source = reviseRoadmap(source, result.revisionInstructions);
      await writeJsonAtomic(artifactPath, source);
      ({ qaInput } = await loadQaInputFromRoadmapOutput(args.runId, { dataDir }));
      result = await runTrainingRoadmapPipeline({
        source,
        qaInput,
        agents: args.agents,
        abortSignal: args.abortSignal,
        session: args.session,
      });
    }

    const finalResult: RoadmapResult = {
      ...result,
      draftInitiatives: toTrainingInitiatives(draftSource),
      draftRoadmap,
    };

    await writeJsonAtomic(getRunScratchPath(args.runId, 'qa_result.json'), finalResult);
    await saveRoadmapVersion(args.runId, finalResult, args.feedback);
    return finalResult;
  });
}
