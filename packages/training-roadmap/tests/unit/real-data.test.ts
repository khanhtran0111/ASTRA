import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { auditDataFirstSource } from '../../src/backend/domain/pipeline.ts';
import { loadQaInputFromRoadmapOutput } from '../../src/backend/domain/qa/roadmap-output-loader.ts';

const fixturesDir = fileURLToPath(new URL('../helpers/fixtures', import.meta.url));
const roadmapFixture = fileURLToPath(
  new URL('../helpers/fixtures/roadmap_output_agent.json', import.meta.url),
);

beforeAll(() => {
  vi.stubEnv('TRAINING_ROADMAP_OUTPUT_FILE', roadmapFixture);
  vi.stubEnv('TRAINING_ROADMAP_DATA_DIR', fixturesDir);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('roadmap_output_agent.json QA loader', () => {
  it('maps the Agent 1 roadmap into the deterministic QA contract', async () => {
    const { source, qaInput } = await loadQaInputFromRoadmapOutput();

    expect(source.initiatives).toHaveLength(22);
    expect(qaInput.roadmap?.items).toHaveLength(22);
    expect(qaInput.priorityResult.initiatives).toHaveLength(22);
    expect(qaInput.roadmap?.items[0]).toMatchObject({
      initiativeId: 'CLS-001',
      skill: 'Kubernetes',
      quarter: 'Q3 2026',
    });
    expect(qaInput.normalizedData.employees?.length).toBeGreaterThan(0);
    expect(source.initiatives[0]?.evidence.some((evidence) => evidence.source === 'DS01')).toBe(
      false,
    );
    expect(auditDataFirstSource(source)).toMatchObject({
      findings: [
        expect.objectContaining({
          type: 'UNSUPPORTED_INITIATIVE',
          message: expect.stringContaining('SOURCE_NOT_AUDITED'),
        }),
      ],
    });
  });
});
