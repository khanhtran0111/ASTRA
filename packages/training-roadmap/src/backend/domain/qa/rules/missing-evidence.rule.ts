import type { QaFinding, QaPriorityResult } from '../qa-types.ts';

export function checkMissingEvidence(priorityResult: QaPriorityResult): QaFinding[] {
  const findings: QaFinding[] = [];

  priorityResult.initiatives.forEach((initiative, index) => {
    const supportedSources = new Set(['DS01', 'DS02', 'DS03', 'DS05']);
    const hasSupportedEvidence = (initiative.evidence ?? []).some((evidence) =>
      supportedSources.has(evidence.source),
    );

    if (!hasSupportedEvidence) {
      findings.push({
        type: 'UNSUPPORTED_INITIATIVE',
        severity: 'HIGH',
        skill: initiative.skill,
        relatedInitiativeId: initiative.id,
        message: 'Initiative has no granular DS01, DS02, DS03, or DS05 evidence.',
        evidence: [
          {
            path: `priorityResult.initiatives[${index}]`,
            value: {
              evidence: initiative.evidence ?? [],
            },
          },
        ],
      });
    }
  });

  return findings;
}
