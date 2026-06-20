import type { QaFinding, QaNormalizedData, QaPriorityResult, QaRoadmap } from '../qa-types.ts';

function quarterTokens(value: string | undefined): string[] {
  if (!value) return [];
  const normalized = value.toUpperCase().replace(/[–—]/g, '-').replaceAll('_', ' ');
  const tokens = new Set<string>();

  for (const match of normalized.matchAll(/Q([1-4])[\s-]*(20\d{2})/g)) {
    tokens.add(`Q${match[1]}_${match[2]}`);
  }
  for (const match of normalized.matchAll(/Q([1-4])\s*-\s*Q([1-4])\s*(20\d{2})/g)) {
    tokens.add(`Q${match[1]}_${match[3]}`);
    tokens.add(`Q${match[2]}_${match[3]}`);
  }

  return [...tokens];
}

export function checkTimelineRisk(
  roadmap: QaRoadmap,
  priorityResult: QaPriorityResult,
  normalizedData: QaNormalizedData,
): QaFinding[] {
  const findings: QaFinding[] = [];
  const horizon = new Set(quarterTokens(normalizedData.planningHorizon));

  roadmap.items.forEach((item, itemIndex) => {
    const initiativeQuarter = quarterTokens(item.quarter);
    const priority = priorityResult.initiatives.find(
      (initiative) => initiative.skill === item.skill,
    );
    const supportingIds = new Set(priority?.supporting_projects ?? []);
    const supportingProjects = (normalizedData.projects ?? []).filter((project) =>
      supportingIds.has(project.id),
    );
    const projectQuarters = new Set(
      supportingProjects.flatMap((project) => quarterTokens(project.quarter)),
    );

    if (initiativeQuarter.length === 0) {
      findings.push({
        type: 'TIMELINE_RISK',
        severity: 'LOW',
        skill: item.skill,
        relatedInitiativeId: item.initiativeId ?? priority?.id,
        message: 'Initiative has no machine-readable quarter for timeline validation.',
        evidence: [{ path: `roadmap.items[${itemIndex}].quarter`, value: item.quarter ?? null }],
      });
      return;
    }

    const fits = initiativeQuarter.some(
      (quarter) => horizon.has(quarter) || projectQuarters.has(quarter),
    );
    if (!fits) {
      findings.push({
        type: 'TIMELINE_RISK',
        severity: 'MEDIUM',
        skill: item.skill,
        relatedInitiativeId: item.initiativeId ?? priority?.id,
        message: `${item.quarter} does not match the planning horizon or supporting project timeline.`,
        evidence: [
          { path: `roadmap.items[${itemIndex}].quarter`, value: item.quarter },
          { path: 'normalizedData.planningHorizon', value: normalizedData.planningHorizon ?? null },
          { path: 'normalizedData.projects', value: supportingProjects },
        ],
      });
    }
  });

  return findings;
}
