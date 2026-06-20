import { describe, expect, it } from 'vitest';
import { loadQaInputFromRoadmapOutput } from '../../src/backend/domain/qa/roadmap-output-loader.ts';

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
  });
});
