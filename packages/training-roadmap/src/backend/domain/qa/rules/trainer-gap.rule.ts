import { matchesSkill } from '../../skill-aliases.ts';
import type { QaFinding, QaNormalizedData, QaPriorityResult, QaRoadmap } from '../qa-types.ts';

export function checkTrainerGap(
  roadmap: QaRoadmap,
  priorityResult: QaPriorityResult,
  normalizedData: QaNormalizedData,
): QaFinding[] {
  const findings: QaFinding[] = [];

  roadmap.items.forEach((item, itemIndex) => {
    const priority = priorityResult.initiatives.find(
      (initiative) => initiative.skill === item.skill,
    );
    const qualifiedTrainers = (normalizedData.trainers ?? []).filter(
      (trainer) =>
        trainer.availableHours > 0 &&
        trainer.skills.some((skill) => matchesSkill(skill, item.skill)),
    );

    const hasDs04Evidence = (item.evidence ?? []).some(
      (evidence) => evidence.source === 'DS04' && evidence.recordId === item.trainerId,
    );

    if (item.trainerId && !hasDs04Evidence) {
      findings.push({
        type: 'UNSUPPORTED_INITIATIVE',
        severity: 'HIGH',
        skill: item.skill,
        relatedInitiativeId: item.initiativeId,
        message: `Assigned trainer ${item.trainerId} has no DS04 evidence record.`,
        evidence: [{ path: `roadmap.items[${itemIndex}].trainerId`, value: item.trainerId }],
      });
      return;
    }

    if (item.trainerType !== 'internal') {
      const specialized = /system design|kubernetes|security|machine learning|mlops/i.test(
        item.skill,
      );
      findings.push({
        type: 'TRAINER_NOT_FOUND',
        severity: specialized ? 'MEDIUM' : 'LOW',
        skill: item.skill,
        relatedInitiativeId: item.initiativeId,
        message: item.fallbackReason
          ? `No internal trainer is assigned; ${item.trainerType} fallback ${item.fallbackReason} is documented.`
          : `No internal trainer is assigned and the ${item.trainerType} fallback is not documented.`,
        evidence: [
          { path: `roadmap.items[${itemIndex}].trainerType`, value: item.trainerType },
          {
            path: `roadmap.items[${itemIndex}].fallbackReason`,
            value: item.fallbackReason ?? null,
          },
        ],
      });
      return;
    }

    if (!priority?.internal_trainer_available || qualifiedTrainers.length === 0) {
      findings.push({
        type: 'TRAINER_NOT_FOUND',
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
