import { describe, expect, it } from 'vitest';
import { calculateQaScore } from '../../src/backend/domain/qa/qa-score.ts';
import type { QaFinding } from '../../src/backend/domain/qa/qa-types.ts';

const finding = (severity: QaFinding['severity']): QaFinding => ({
  type: 'UNSUPPORTED_INITIATIVE',
  severity,
  message: 'Evidence missing.',
  evidence: [{ path: 'priorityResult.initiatives[0]', value: null }],
});

describe('QA score', () => {
  it('deducts 20/10/5 and derives risk from the final score', () => {
    expect(calculateQaScore([finding('HIGH'), finding('MEDIUM'), finding('LOW')])).toEqual({
      score: 65,
      riskLevel: 'HIGH',
      reason: '1 HIGH, 1 MEDIUM, and 1 LOW findings produced score 65/100.',
    });
  });

  it('returns a clean score when there are no findings', () => {
    expect(calculateQaScore([])).toEqual({
      score: 100,
      riskLevel: 'LOW',
      reason: '0 HIGH, 0 MEDIUM, and 0 LOW findings produced score 100/100.',
    });
  });
});
