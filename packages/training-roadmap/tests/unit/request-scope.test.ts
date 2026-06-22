import { describe, expect, it } from 'vitest';
import { buildRequestScopeFindings } from '../../src/backend/domain/qa/request-scope.ts';

describe('request scope QA', () => {
  it('rejects an initiative that the QA agent found unrelated to the user prompt', () => {
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
        severity: 'HIGH',
        relatedInitiativeId: 'CLS-K8S',
      }),
    ]);
  });

  it('fails closed when an initiative was not assessed against a non-empty prompt', () => {
    const findings = buildRequestScopeFindings({
      userPrompt: 'Frontend roadmap',
      initiatives: [{ id: 'CLS-REACT', topic: 'React' }],
      decisions: [],
    });

    expect(findings[0]).toMatchObject({
      type: 'PROMPT_SCOPE_VIOLATION',
      severity: 'HIGH',
      relatedInitiativeId: 'CLS-REACT',
    });
  });
});
