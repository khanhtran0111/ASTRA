import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeTrainingRoadmapRun } from '../../src/backend/domain/execute-training-roadmap-run.ts';
import { getRunScratchPath } from '../../src/backend/scratch-storage.ts';

const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('training roadmap run diagnostics', () => {
  it('persists data-first diagnostics before reporting unavailable source data', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'training-roadmap-empty-data-'));
    const runId = 'missing-production-data';
    const runDir = getRunScratchPath(runId);
    directories.push(dataDir, runDir);

    const execution = executeTrainingRoadmapRun({
      runId,
      userPrompt: 'Create one Q3/2026 Security Testing initiative.',
      agents: {} as never,
      dataDir,
    });

    await expect(execution).rejects.toMatchObject({
      code: 'TRAINING_DATA_UNAVAILABLE',
      message: expect.stringContaining('DS01'),
    });

    await expect(access(join(runDir, 'data_inventory.json'))).resolves.toBeUndefined();
    await expect(access(join(runDir, 'coverage_report.json'))).resolves.toBeUndefined();
    const inventory = JSON.parse(await readFile(join(runDir, 'data_inventory.json'), 'utf8'));
    expect(inventory).toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceId: 'DS01', validRows: 0 })]),
    );
  });
});
