import { describe, expect, it } from 'vitest';
import { QA_TOOL_IDS } from '../../src/backend/agent-tools.ts';
import {
  assertQaScoreMatches,
  assertQaToolsCalled,
  createQaToolRun,
  deleteQaToolRun,
  markQaToolCalled,
  recordQaScoreCall,
} from '../../src/backend/domain/qa/qa-tool-context.ts';

describe('QA agent tool-run enforcement', () => {
  it('requires every tool and the verbatim score-tool result', () => {
    const runId = createQaToolRun({
      priorityResult: { initiatives: [] },
      normalizedData: {},
    });
    const toolIds = Object.values(QA_TOOL_IDS);

    try {
      expect(() => assertQaToolsCalled(runId, toolIds)).toThrow('skipped required tools');
      for (const toolId of toolIds) markQaToolCalled(runId, toolId);
      expect(() => assertQaToolsCalled(runId, toolIds)).not.toThrow();

      const result = { score: 100, riskLevel: 'LOW' as const, reason: 'No findings.' };
      recordQaScoreCall(runId, [], result);
      expect(() =>
        assertQaScoreMatches(runId, {
          findings: [],
          score: result.score,
          riskLevel: result.riskLevel,
          riskReason: result.reason,
        }),
      ).not.toThrow();
    } finally {
      deleteQaToolRun(runId);
    }
  });
});
