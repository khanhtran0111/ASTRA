import { matchesSkill } from '../../skill-aliases.ts';
import type { QaFinding, QaNormalizedData, QaPriorityResult, QaRoadmap } from '../qa-types.ts';

export function checkProjectRequirement(
  roadmap: QaRoadmap,
  priorityResult: QaPriorityResult,
  normalizedData: QaNormalizedData,
): QaFinding[] {
  const findings: QaFinding[] = [];

  roadmap.items.forEach((item, itemIndex) => {
    const priority = priorityResult.initiatives.find(
      (initiative) => initiative.skill === item.skill,
    );
    const supportingIds = new Set(priority?.supporting_projects ?? []);
    const matchingProjects = (normalizedData.projects ?? []).filter(
      (project) =>
        supportingIds.has(project.id) &&
        (project.requiredSkills ?? []).some((skill) => matchesSkill(skill, item.skill)),
    );

    if (matchingProjects.length === 0) {
      findings.push({
        type: 'MISSING_PROJECT_REQUIREMENT',
        severity: 'MEDIUM',
        skill: item.skill,
        relatedInitiativeId: item.initiativeId ?? priority?.id,
        message: 'No referenced supporting project requires this initiative skill.',
        evidence: [
          { path: `roadmap.items[${itemIndex}].skill`, value: item.skill },
          {
            path: `priorityResult.initiatives[skill=${item.skill}].supporting_projects`,
            value: [...supportingIds],
          },
          { path: 'normalizedData.projects', value: normalizedData.projects ?? [] },
        ],
      });
    }
  });

  return findings;
}
