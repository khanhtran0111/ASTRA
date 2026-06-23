import type { QaFinding, QaNormalizedData, QaRoadmap } from '../qa-types.ts';

export function checkTraceabilityGap(
  roadmap: QaRoadmap,
  normalizedData: QaNormalizedData,
): QaFinding[] {
  const validIds = new Set([
    ...(normalizedData.employees?.map((employee) => employee.id) ?? []),
    ...(normalizedData.trainers?.map((trainer) => trainer.id) ?? []),
    ...(normalizedData.projects?.map((project) => project.id) ?? []),
    ...(normalizedData.bodGoals?.map((goal) => goal.id) ?? []),
  ]);
  const findings: QaFinding[] = [];

  roadmap.items.forEach((item, itemIndex) => {
    const unknownIds = (item.evidence ?? [])
      .filter((evidence) => evidence.source !== 'DS03' && !validIds.has(evidence.recordId))
      .map((evidence) => evidence.recordId);
    if (unknownIds.length > 0) {
      findings.push({
        type: 'TRACEABILITY_GAP',
        severity: 'MEDIUM',
        skill: item.skill,
        relatedInitiativeId: item.initiativeId,
        message: `Roadmap contains unknown evidence IDs: ${unknownIds.join(', ')}.`,
        evidence: [
          { path: `roadmap.items[${itemIndex}].evidence`, value: item.evidence },
          {
            path: 'normalizedData.projects[*].id + normalizedData.bodGoals[*].id',
            value: [...validIds],
          },
        ],
      });
    }
  });

  return findings;
}
