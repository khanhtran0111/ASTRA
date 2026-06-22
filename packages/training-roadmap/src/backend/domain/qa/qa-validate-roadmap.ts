import { calculateQaScore } from './qa-score.ts';
import type {
  QaFinding,
  QaNormalizedData,
  QaPriorityResult,
  QaRoadmap,
  QaValidationResult,
} from './qa-types.ts';
import { checkBodAlignment } from './rules/bod-alignmen.rule.ts';
import { checkInvalidTrainee } from './rules/invalid-trainee.rule.ts';
import { checkMissingEvidence } from './rules/missing-evidence.rule.ts';
import { checkProjectRequirement } from './rules/project-requirement.rule.ts';
import { checkTimelineRisk } from './rules/timeline-risk.rule.ts';
import { checkTraceabilityGap } from './rules/traceability-gap.rule.ts';
import { checkTraineeMismatch } from './rules/trainee-mismatch.rule.ts';
import { checkTrainerGap } from './rules/trainer-gap.rule.ts';

export interface QaInput {
  request?: {
    userPrompt: string;
  };
  roadmap?: QaRoadmap;
  priorityResult: QaPriorityResult;
  normalizedData: QaNormalizedData;
}

function deriveRoadmap(priorityResult: QaPriorityResult): QaRoadmap {
  return {
    items: priorityResult.initiatives.map((initiative) => ({
      initiativeId: initiative.id,
      skill: initiative.skill,
      traineeIds: initiative.target_employees ?? [],
      trainerType: initiative.internal_trainer_available ? 'internal' : 'external',
      quarter: initiative.quarter,
      evidence: initiative.evidence ?? [],
      alignmentType: initiative.alignmentType,
      approvalRequired: initiative.approvalRequired,
      alignmentNote: initiative.alignmentNote,
    })),
  };
}

export async function qaValidateRoadmap(input: QaInput): Promise<QaValidationResult> {
  const roadmap = input.roadmap ?? deriveRoadmap(input.priorityResult);
  const findings: QaFinding[] = [
    ...checkInvalidTrainee(roadmap, input.normalizedData),
    ...checkTrainerGap(roadmap, input.priorityResult, input.normalizedData),
    ...checkMissingEvidence(input.priorityResult),
    ...checkBodAlignment(roadmap, input.priorityResult, input.normalizedData),
    ...checkProjectRequirement(roadmap, input.priorityResult, input.normalizedData),
    ...checkTraineeMismatch(roadmap, input.normalizedData, input.request?.userPrompt),
    ...checkTimelineRisk(
      roadmap,
      input.priorityResult,
      input.normalizedData,
      input.request?.userPrompt,
    ),
    ...checkTraceabilityGap(roadmap, input.normalizedData),
  ];
  const result = calculateQaScore(findings);

  return {
    findings,
    score: result.score,
    riskLevel: result.riskLevel,
    riskReason: result.reason,
    evidencePack: {
      priorityResult: input.priorityResult,
      projects: input.normalizedData.projects ?? [],
      bodGoals: input.normalizedData.bodGoals ?? [],
      findings: findings.map((finding) => ({
        type: finding.type,
        relatedInitiativeId: finding.relatedInitiativeId,
        evidence: finding.evidence,
      })),
    },
  };
}
