import type { QaFinding, QaPriorityResult } from '../qa-types.ts';

export function checkMissingEvidence(priorityResult: QaPriorityResult): QaFinding[] {
  const findings: QaFinding[] = [];

  priorityResult.initiatives.forEach((initiative, index) => {
    const hasProjects = (initiative.supporting_projects?.length ?? 0) > 0;
    const hasGoals = (initiative.supporting_bod_goals?.length ?? 0) > 0;
    const hasSummary = Boolean(initiative.evidence_summary?.trim());

    if (!hasProjects && !hasGoals && !hasSummary) {
      findings.push({
        type: 'MISSING_EVIDENCE',
        severity: 'MEDIUM',
        skill: initiative.skill,
        relatedInitiativeId: initiative.id,
        message: 'Initiative has no supporting project, BOD goal, or evidence summary.',
        evidence: [
          {
            path: `priorityResult.initiatives[${index}]`,
            value: {
              supporting_projects: initiative.supporting_projects ?? [],
              supporting_bod_goals: initiative.supporting_bod_goals ?? [],
              evidence_summary: initiative.evidence_summary ?? null,
            },
          },
        ],
      });
    }
  });

  return findings;
}
