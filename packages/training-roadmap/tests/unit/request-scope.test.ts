import { describe, expect, it } from 'vitest';
import { buildRequestScopeFindings } from '../../src/backend/domain/qa/request-scope.ts';

describe('request scope QA', () => {
  it('requests revision at medium severity for an extra topic', () => {
    const findings = buildRequestScopeFindings({
      userPrompt: 'Create a Q3 roadmap for Frontend focused on React and TypeScript.',
      initiatives: [{ id: 'CLS-K8S', topic: 'Kubernetes' }],
      decisions: [
        {
          initiativeId: 'CLS-K8S',
          skill: 'Kubernetes',
          decision: 'NOT_ALIGNED',
          rationale: 'Kubernetes is outside the requested Frontend capability scope.',
          evidenceIds: ['GOAL-2026-07'],
        },
      ],
    });

    expect(findings).toEqual([
      expect.objectContaining({
        type: 'PROMPT_SCOPE_VIOLATION',
        severity: 'MEDIUM',
        relatedInitiativeId: 'CLS-K8S',
      }),
    ]);
  });

  it('does not invent a scope violation when semantic QA omitted a decision', () => {
    const findings = buildRequestScopeFindings({
      userPrompt: 'Frontend roadmap',
      initiatives: [{ id: 'CLS-REACT', topic: 'React' }],
      decisions: [],
    });

    expect(findings).toEqual([]);
  });

  it('classifies a missing requested roadmap as a coverage shortfall', () => {
    const findings = buildRequestScopeFindings({
      userPrompt: 'Frontend roadmap focused on React',
      initiatives: [],
      decisions: [],
    });

    expect(findings).toEqual([
      expect.objectContaining({
        type: 'COVERAGE_SHORTFALL',
        severity: 'HIGH',
      }),
    ]);
  });
});
