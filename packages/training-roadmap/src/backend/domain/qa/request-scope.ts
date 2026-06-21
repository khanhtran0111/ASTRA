import type { QaFinding } from './qa-types.ts';

type SerializedQaFinding = Omit<QaFinding, 'evidence'> & {
  evidence: Array<{ path: string; value: string }>;
};

export type RequestScopeDecision = {
  initiativeId?: string;
  skill: string;
  decision: 'ALIGNED' | 'NOT_ALIGNED';
  rationale: string;
  evidenceIds: string[];
};

export function buildRequestScopeFindings(args: {
  userPrompt: string;
  initiatives: Array<{ id: string; topic: string }>;
  decisions: RequestScopeDecision[];
}): SerializedQaFinding[] {
  if (!args.userPrompt.trim()) return [];

  if (args.initiatives.length === 0) {
    return [
      {
        type: 'REQUEST_SCOPE_MISMATCH',
        severity: 'HIGH',
        message: 'Agent 1 produced no evidence-backed initiatives for the user request.',
        evidence: [{ path: 'request.userPrompt', value: args.userPrompt }],
      },
    ];
  }

  return args.initiatives.flatMap((initiative) => {
    const decision = args.decisions.find(
      (item) => item.initiativeId === initiative.id || item.skill === initiative.topic,
    );

    if (!decision) {
      return [
        {
          type: 'REQUEST_SCOPE_MISMATCH' as const,
          severity: 'HIGH' as const,
          skill: initiative.topic,
          relatedInitiativeId: initiative.id,
          message: 'QA did not verify this initiative against the original user request.',
          evidence: [
            { path: 'request.userPrompt', value: args.userPrompt },
            { path: `initiatives[id=${initiative.id}].topic`, value: initiative.topic },
          ],
        },
      ];
    }

    if (decision.decision === 'ALIGNED') return [];

    return [
      {
        type: 'REQUEST_SCOPE_MISMATCH' as const,
        severity: 'HIGH' as const,
        skill: initiative.topic,
        relatedInitiativeId: initiative.id,
        message: decision.rationale,
        evidence: [
          { path: 'request.userPrompt', value: args.userPrompt },
          { path: `initiatives[id=${initiative.id}].topic`, value: initiative.topic },
          {
            path: `semanticSummary[initiativeId=${initiative.id}].evidenceIds`,
            value: JSON.stringify(decision.evidenceIds),
          },
        ],
      },
    ];
  });
}
