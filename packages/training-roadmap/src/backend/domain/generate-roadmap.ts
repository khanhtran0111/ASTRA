/**
 * Draft Roadmap Generator
 *
 * Takes matched training classes and groups them by target quarter,
 * producing the DraftRoadmapOutput JSON that is forwarded to the QA Agent.
 */

import type { DraftRoadmapOutput, MatchedTrainingClass, RoadmapClassEntry } from './types.ts';

/**
 * Generate a draft roadmap from matched training classes.
 *
 * Classes are grouped by `targetQuarter` and enriched with alignment
 * evidence and trainee counts.
 *
 * @param classes  Output of `matchTrainers()`.
 * @param roadmapId  Optional roadmap version identifier.
 * @returns  A complete DraftRoadmapOutput ready for QA review.
 */
export function generateDraftRoadmap(
  classes: MatchedTrainingClass[],
  roadmapId = 'RM-2026-V1',
): DraftRoadmapOutput {
  // Group classes by quarter
  const quarters: Record<string, RoadmapClassEntry[]> = {};

  for (const cls of classes) {
    const entry: RoadmapClassEntry = {
      classId: cls.classId,
      topic: cls.skillName,
      priorityScore: cls.priorityScore,
      alignmentEvidence: {
        bodGoals: cls.evidence.bodGoals,
        projects: cls.evidence.projectIds,
      },
      evidence: cls.evidenceRefs ?? [],
      traineeCount: cls.trainees.length,
      trainees: cls.trainees,
      traineeDetails: cls.traineeDetails,
      estimatedHours: cls.estimatedHours,
      objective: cls.objective,
      prerequisites: cls.prerequisites,
      learningFormat: cls.learningFormat,
      formatExplanation: cls.formatExplanation,
      evaluationCriteria: cls.evaluationCriteria,
      durationWeeks: cls.durationWeeks,
      startWeek: cls.startWeek,
      endWeek: cls.endWeek,
      fallbackPlan: cls.fallbackPlan,
      resource: {
        trainerId: cls.assignedTrainer,
        isExternalRequired: cls.isExternalRequired,
        fallbackReason: cls.fallbackReason ?? null,
      },
    };

    const qList = quarters[cls.targetQuarter] ?? [];
    qList.push(entry);
    quarters[cls.targetQuarter] = qList;
  }

  return {
    roadmapId,
    status: 'DRAFT',
    generatedAt: new Date().toISOString(),
    quarters,
  };
}
