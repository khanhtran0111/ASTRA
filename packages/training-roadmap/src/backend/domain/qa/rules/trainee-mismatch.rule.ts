import type { QaFinding, QaNormalizedData, QaRoadmap } from '../qa-types.ts';

const normalize = (value: string) => value.trim().toLowerCase();

export function checkTraineeMismatch(
  roadmap: QaRoadmap,
  normalizedData: QaNormalizedData,
): QaFinding[] {
  const employees = new Map(
    (normalizedData.employees ?? []).map((employee) => [employee.id, employee]),
  );
  const findings: QaFinding[] = [];

  roadmap.items.forEach((item, itemIndex) => {
    item.traineeIds?.forEach((traineeId, traineeIndex) => {
      const employee = employees.get(traineeId);
      if (
        employee &&
        !employee.targetSkills.some((skill) => normalize(skill) === normalize(item.skill))
      ) {
        findings.push({
          type: 'TRAINEE_MISMATCH',
          severity: 'MEDIUM',
          skill: item.skill,
          relatedInitiativeId: item.initiativeId,
          message: `${traineeId} does not list ${item.skill} as a target skill.`,
          evidence: [
            {
              path: `roadmap.items[${itemIndex}].traineeIds[${traineeIndex}]`,
              value: traineeId,
            },
            {
              path: `normalizedData.employees[id=${traineeId}].targetSkills`,
              value: employee.targetSkills,
            },
          ],
        });
      }
    });
  });

  return findings;
}
