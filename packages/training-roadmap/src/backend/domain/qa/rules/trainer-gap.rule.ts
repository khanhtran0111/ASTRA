import type { QaFinding, QaNormalizedData, QaPriorityResult, QaRoadmap } from '../qa-types.ts';

const normalize = (value: string) => value.trim().toLowerCase();

export function checkTrainerGap(
  roadmap: QaRoadmap,
  priorityResult: QaPriorityResult,
  normalizedData: QaNormalizedData,
): QaFinding[] {
  const findings: QaFinding[] = [];

  roadmap.items.forEach((item, itemIndex) => {
    if (item.trainerType !== 'internal') return;
    const priority = priorityResult.initiatives.find(
      (initiative) => initiative.skill === item.skill,
    );
    const qualifiedTrainers = (normalizedData.trainers ?? []).filter(
      (trainer) =>
        trainer.availableHours > 0 &&
        trainer.skills.some((skill) => normalize(skill) === normalize(item.skill)),
    );

    if (!priority?.internal_trainer_available || qualifiedTrainers.length === 0) {
      findings.push({
        type: 'TRAINER_GAP',
        severity: 'HIGH',
        skill: item.skill,
        relatedInitiativeId: item.initiativeId,
        message: 'Internal delivery is selected but no qualified trainer has available capacity.',
        evidence: [
          {
            path: `roadmap.items[${itemIndex}].trainerType`,
            value: item.trainerType,
          },
          {
            path: `priorityResult.initiatives[skill=${item.skill}].internal_trainer_available`,
            value: priority?.internal_trainer_available ?? null,
          },
          {
            path: 'normalizedData.trainers',
            value: qualifiedTrainers,
          },
        ],
      });
    }
  });

  return findings;
}
