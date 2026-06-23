import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runDataDrivenCoordinator } from '../../src/backend/domain/data-driven-pipeline.ts';
import { recordDataFirstRevision } from '../../src/backend/domain/revise-roadmap.ts';
import { toRoadmapOutputAgent } from '../../src/backend/domain/to-roadmap-output-agent.ts';

const dataDir = fileURLToPath(new URL('../helpers/data-first-fixtures', import.meta.url));

describe('data-first revision flow', () => {
  it('records a freshly regenerated artifact instead of patching the previous artifact', () => {
    const userPrompt = 'Create one Q3/2026 Security Testing initiative for Software Engineer.';
    const firstSnapshot = runDataDrivenCoordinator({
      dataDir,
      runId: 'revision-run',
      userPrompt,
    });
    const previousSource = toRoadmapOutputAgent({ snapshot: firstSnapshot, userPrompt });
    const previousInitiative = previousSource.initiatives[0];
    if (!previousInitiative) throw new Error('Expected initial initiative');
    previousInitiative.topic = 'Patched legacy topic';

    const rerunSnapshot = runDataDrivenCoordinator({
      dataDir,
      runId: 'revision-run',
      userPrompt,
    });
    const regeneratedSource = toRoadmapOutputAgent({
      snapshot: rerunSnapshot,
      userPrompt,
      previousSource,
    });
    const instructions = [
      {
        initiativeId: regeneratedSource.initiatives[0]?.id ?? 'ROADMAP',
        issueType: 'TRACEABILITY_GAP',
        action: 'ADD_EVIDENCE' as const,
        message: 'Rebuild evidence from source data.',
      },
    ];

    const revised = recordDataFirstRevision({
      regeneratedSource,
      previousSource,
      instructions,
    });

    expect(revised.initiatives[0]?.topic).toBe('Security Testing');
    expect(revised.revisionCount).toBe(1);
    expect(revised.revisionHistory).toEqual([
      expect.objectContaining({ revision: 1, instructions }),
    ]);
    expect(revised.executionLog).toContain(
      'Agent 1 re-ran the deterministic data-first coordinator from source data.',
    );
  });
});
