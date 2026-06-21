import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

/**
 * Runtime scratch directory shared by the training-roadmap route and tools.
 *
 * Do not derive this path from import.meta.url or process.cwd(). In Docker and
 * pnpm workspaces the package may execute from inside node_modules, while the
 * process working directory can vary between the CLI, server, and tests.
 */
const SCRATCH_DIR = process.env.ASTRA_SCRATCH_DIR
  ? resolve(process.env.ASTRA_SCRATCH_DIR)
  : resolve(tmpdir(), 'astra', 'scratch');

mkdirSync(SCRATCH_DIR, { recursive: true });

const activeRun = new AsyncLocalStorage<string>();

function assertSafeRunId(runId: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(runId)) {
    throw new Error('runId contains unsupported characters');
  }
}

export function getScratchPath(...segments: string[]): string {
  return resolve(SCRATCH_DIR, ...segments);
}

export function getRunScratchPath(runId: string, ...segments: string[]): string {
  assertSafeRunId(runId);
  const runDirectory = getScratchPath('training-roadmap-runs', runId);
  mkdirSync(runDirectory, { recursive: true });
  return resolve(runDirectory, ...segments);
}

export function getActiveRunScratchPath(...segments: string[]): string {
  const runId = activeRun.getStore();
  return runId ? getRunScratchPath(runId, ...segments) : getScratchPath(...segments);
}

export function withTrainingRoadmapRun<T>(runId: string, callback: () => T): T {
  assertSafeRunId(runId);
  return activeRun.run(runId, callback);
}

export function readJsonFileOrDefault(filePath: string, fallback: unknown): unknown {
  if (!existsSync(filePath)) {
    return fallback;
  }

  const raw = readFileSync(filePath, 'utf-8').trim();
  if (!raw) {
    return fallback;
  }

  return JSON.parse(raw) as unknown;
}
