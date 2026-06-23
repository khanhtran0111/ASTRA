import type { RevisionInstruction } from '../../types.ts';
import type { RoadmapOutputAgent } from './qa/roadmap-output-loader.ts';

/**
 * Records a revision after Agent 1 has regenerated the complete artifact from
 * source data. This function intentionally does not patch initiative fields:
 * allocation, trainer matching, evidence, scoring, and prompt scope must come
 * from a fresh deterministic coordinator run.
 */
export function recordDataFirstRevision(args: {
  regeneratedSource: RoadmapOutputAgent;
  previousSource: RoadmapOutputAgent;
  instructions: RevisionInstruction[];
}): RoadmapOutputAgent {
  if (args.regeneratedSource.runId !== args.previousSource.runId) {
    throw new Error(
      `Regenerated artifact belongs to run ${args.regeneratedSource.runId}, not ${args.previousSource.runId}`,
    );
  }

  const revisionCount = args.previousSource.revisionCount + 1;
  return {
    ...args.regeneratedSource,
    revisionCount,
    revisionHistory: [
      ...args.previousSource.revisionHistory,
      {
        revision: revisionCount,
        revisedAt: new Date().toISOString(),
        instructions: args.instructions,
      },
    ],
    executionLog: [
      ...args.regeneratedSource.executionLog.filter(
        (entry) => entry !== 'Paused at Human Review Gate.',
      ),
      'Agent 2 requested roadmap revision.',
      'Agent 1 re-ran the deterministic data-first coordinator from source data.',
    ],
  };
}
