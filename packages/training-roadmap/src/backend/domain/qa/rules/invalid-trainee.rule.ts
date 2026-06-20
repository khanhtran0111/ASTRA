import type { QaFinding, QaNormalizedData, QaRoadmap } from '../qa-types.ts';

export function checkInvalidTrainee(
  roadmap: QaRoadmap,
  normalizedData: QaNormalizedData,
): QaFinding[] {
  const employeeIds = new Set(normalizedData.employees?.map((employee) => employee.id) ?? []);
  const findings: QaFinding[] = [];

  roadmap.items.forEach((item, itemIndex) => {
    item.traineeIds?.forEach((traineeId, traineeIndex) => {
      if (!employeeIds.has(traineeId)) {
        findings.push({
          type: 'INVALID_TRAINEE',
          severity: 'HIGH',
          skill: item.skill,
          relatedInitiativeId: item.initiativeId,
          message: `${traineeId} does not exist in normalized employee data.`,
          evidence: [
            {
              path: `roadmap.items[${itemIndex}].traineeIds[${traineeIndex}]`,
              value: traineeId,
            },
            {
              path: 'normalizedData.employees[*].id',
              value: [...employeeIds],
            },
          ],
        });
      }
    });
  });

  return findings;
}
