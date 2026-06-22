import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  getActiveRunScratchPath,
  readJsonFileOrDefault,
  withTrainingRoadmapRun,
} from '../../src/backend/scratch-storage.ts';

const testDir = mkdtempSync(join(tmpdir(), 'training-roadmap-scratch-'));

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('readJsonFileOrDefault', () => {
  it('returns the fallback when the file does not exist', () => {
    expect(readJsonFileOrDefault(join(testDir, 'missing.json'), [])).toEqual([]);
  });

  it('returns the fallback when the file is empty', () => {
    const filePath = join(testDir, 'empty.json');
    writeFileSync(filePath, '   ');

    expect(readJsonFileOrDefault(filePath, { ok: false })).toEqual({ ok: false });
  });

  it('parses a non-empty JSON file', () => {
    const filePath = join(testDir, 'data.json');
    writeFileSync(filePath, JSON.stringify({ ok: true }));

    expect(readJsonFileOrDefault(filePath, null)).toEqual({ ok: true });
  });
});

describe('run-scoped scratch storage', () => {
  it('keeps concurrent Agent 1 artifacts isolated by runId', async () => {
    const suffix = globalThis.crypto.randomUUID();
    const [firstPath, secondPath] = await Promise.all([
      withTrainingRoadmapRun(`run-a-${suffix}`, async () => {
        await Promise.resolve();
        return getActiveRunScratchPath('roadmap_output_agent.json');
      }),
      withTrainingRoadmapRun(`run-b-${suffix}`, async () => {
        await Promise.resolve();
        return getActiveRunScratchPath('roadmap_output_agent.json');
      }),
    ]);

    expect(firstPath).not.toBe(secondPath);
    expect(firstPath).toContain(`run-a-${suffix}`);
    expect(secondPath).toContain(`run-b-${suffix}`);

    rmSync(dirname(firstPath), { recursive: true, force: true });
    rmSync(dirname(secondPath), { recursive: true, force: true });
  });
});
