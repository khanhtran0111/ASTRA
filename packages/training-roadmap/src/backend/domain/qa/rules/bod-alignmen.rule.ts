import type { QaFinding, QaNormalizedData, QaPriorityResult, QaRoadmap } from '../qa-types.ts';

const normalize = (value: string) => value.trim().toLowerCase();

export function checkBodAlignment(
  roadmap: QaRoadmap,
  priorityResult: QaPriorityResult,
  normalizedData: QaNormalizedData,
): QaFinding[] {
  const findings: QaFinding[] = [];

  roadmap.items.forEach((item, itemIndex) => {
    const priority = priorityResult.initiatives.find(
      (initiative) => initiative.skill === item.skill,
    );
    const supportingGoalIds = new Set(priority?.supporting_bod_goals ?? []);
    const matchingGoals = (normalizedData.bodGoals ?? []).filter(
      (goal) =>
        supportingGoalIds.has(goal.id) &&
        (goal.requiredSkills ?? []).some((skill) => normalize(skill) === normalize(item.skill)),
    );

    if (matchingGoals.length === 0) {
      findings.push({
        type: 'BOD_ALIGNMENT_RISK',
        severity: 'MEDIUM',
        skill: item.skill,
        relatedInitiativeId: item.initiativeId ?? priority?.id,
        message: 'Initiative skill is not aligned with a referenced BOD goal.',
        evidence: [
          {
            path: `roadmap.items[${itemIndex}].skill`,
            value: item.skill,
          },
          {
            path: `priorityResult.initiatives[skill=${item.skill}].supporting_bod_goals`,
            value: [...supportingGoalIds],
          },
          {
            path: 'normalizedData.bodGoals',
            value: normalizedData.bodGoals ?? [],
          },
        ],
      });
    }
  });

  return findings;
}
