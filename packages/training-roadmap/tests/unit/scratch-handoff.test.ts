import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const roadmapFixture = fileURLToPath(
  new URL('../helpers/fixtures/roadmap_output_agent.json', import.meta.url),
);
const fixturesDir = fileURLToPath(new URL('../helpers/fixtures', import.meta.url));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Agent 1 to QA scratch handoff', () => {
  it('loads the roadmap from the shared runtime scratch path', async () => {
    const scratchDir = await mkdtemp(join(tmpdir(), 'training-roadmap-handoff-'));

    try {
      vi.stubEnv('ASTRA_SCRATCH_DIR', scratchDir);
      vi.stubEnv('TRAINING_ROADMAP_OUTPUT_FILE', '');
      vi.stubEnv('TRAINING_ROADMAP_DATA_DIR', fixturesDir);
      vi.resetModules();

      const { getScratchPath } = await import('../../src/backend/scratch-storage.ts');
      await copyFile(roadmapFixture, getScratchPath('roadmap_output_agent.json'));

      const { loadQaInputFromRoadmapOutput } = await import(
        '../../src/backend/domain/qa/roadmap-output-loader.ts'
      );
      const { source, qaInput } = await loadQaInputFromRoadmapOutput();

      expect(source.runId).toBe('fixture-roadmap-run');
      expect(qaInput.roadmap?.items[0]).toMatchObject({
        initiativeId: 'CLS-001',
        trainerType: 'internal',
      });
    } finally {
      await rm(scratchDir, { recursive: true, force: true });
    }
  });
});
