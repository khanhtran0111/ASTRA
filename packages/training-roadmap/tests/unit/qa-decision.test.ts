import { describe, expect, it } from 'vitest';
import {
  buildQaReviewResult,
  partitionQaFindings,
} from '../../src/backend/domain/qa/qa-decision.ts';
import { calculateQaScore } from '../../src/backend/domain/qa/qa-score.ts';
import type { QaFinding, QaRoadmapItem } from '../../src/backend/domain/qa/qa-types.ts';

function finding(overrides: Partial<QaFinding> = {}): QaFinding {
  return {
    type: 'MISSING_PROJECT_REQUIREMENT',
    severity: 'MEDIUM',
    message: 'No direct DS02 project requirement was found.',
    relatedInitiativeId: 'CLS-001',
    skill: 'System Design',
    evidence: [{ path: 'initiative.evidence', value: [] }],
    ...overrides,
  };
}

function initiative(overrides: Partial<QaRoadmapItem> = {}): QaRoadmapItem {
  return {
    initiativeId: 'CLS-001',
    skill: 'System Design',
    traineeIds: ['EMP-016'],
    trainerType: 'internal',
    quarter: 'Q3 2026',
    evidence: [],
    ...overrides,
  };
}

const completeFallbackPlan = {
  learningMode: 'external' as const,
  pic: 'L&D Coordinator',
  materials: ['Approved external course'],
  milestones: [{ week: 1, description: 'Start course', deliverable: 'Enrollment proof' }],
  estimatedHours: 16,
  evaluationCriteria: 'Pass the practical assessment.',
};

describe('training roadmap QA decision gate', () => {
  it('passes a clean evidence-backed roadmap', () => {
    const result = buildQaReviewResult({
      findings: [],
      score: 100,
      riskLevel: 'LOW',
      initiatives: [initiative()],
      revisionCount: 0,
    });

    expect(result).toMatchObject({
      qaDecision: 'PASS',
      approvalRequirement: 'HUMAN_APPROVAL',
      blockingIssues: [],
      revisionInstructions: [],
    });
  });

  it('requires revision for first-audit missing project evidence', () => {
    const result = buildQaReviewResult({
      findings: [finding()],
      score: 90,
      riskLevel: 'MEDIUM',
      initiatives: [initiative()],
      revisionCount: 0,
    });

    expect(result.qaDecision).toBe('REVISE_REQUIRED');
    expect(result.approvalRequirement).toBe('REVISION_REQUIRED');
    expect(result.revisionInstructions).toContainEqual(
      expect.objectContaining({
        initiativeId: 'CLS-001',
        issueType: 'MISSING_PROJECT_REQUIREMENT',
        action: 'CHANGE_ALIGNMENT_TYPE',
      }),
    );
  });

  it('allows approve-with-risks after the missing-project revision is explicit', () => {
    const result = buildQaReviewResult({
      findings: [finding()],
      score: 90,
      riskLevel: 'MEDIUM',
      initiatives: [
        initiative({
          alignmentType: 'BOD_AND_SURVEY_ONLY',
          approvalRequired: true,
          alignmentNote: 'No direct project roadmap evidence found; requires L&D approval.',
        }),
      ],
      revisionCount: 1,
    });

    expect(result).toMatchObject({
      qaDecision: 'PASS_WITH_WARNINGS',
      approvalRequirement: 'APPROVE_WITH_RISKS',
    });
  });

  it('does not deduct resolved alignment and complete fallback warnings from the score', () => {
    const findings = [
      finding(),
      finding({
        type: 'TRAINER_NOT_FOUND',
        severity: 'MEDIUM',
        message: 'No internal trainer is assigned.',
      }),
    ];
    const initiatives = [
      initiative({
        trainerType: 'external',
        fallbackReason: 'SKILL_NOT_FOUND_INTERNAL',
        fallbackPlan: completeFallbackPlan,
        alignmentType: 'BOD_AND_SURVEY_ONLY',
        approvalRequired: true,
        alignmentNote: 'No direct DS02 project exists; human risk approval is required.',
      }),
    ];

    expect(partitionQaFindings({ findings, initiatives })).toEqual({
      unresolvedFindings: [],
      resolvedWarnings: findings,
    });
    expect(
      calculateQaScore(partitionQaFindings({ findings, initiatives }).unresolvedFindings),
    ).toMatchObject({ score: 100, riskLevel: 'LOW' });
  });

  it('keeps an unresolved timeline mismatch in the revision path', () => {
    const result = buildQaReviewResult({
      findings: [
        finding({
          type: 'TIMELINE_MISMATCH',
          severity: 'MEDIUM',
          message: 'Q4 is outside the requested Q3 window.',
        }),
      ],
      score: 90,
      riskLevel: 'LOW',
      initiatives: [initiative({ quarter: 'Q4 2026' })],
      revisionCount: 0,
    });

    expect(result).toMatchObject({
      qaDecision: 'REVISE_REQUIRED',
      revisionInstructions: [expect.objectContaining({ issueType: 'TIMELINE_MISMATCH' })],
    });
  });

  it('requests trainee reallocation before blocking missing DS01 evidence', () => {
    const issue = finding({
      type: 'NO_TRAINEE_EVIDENCE',
      severity: 'HIGH',
      message: 'EMP-999 has no matching DS01 evidence.',
    });
    const result = buildQaReviewResult({
      findings: [issue],
      score: 80,
      riskLevel: 'HIGH',
      initiatives: [initiative()],
      revisionCount: 0,
    });

    expect(result.qaDecision).toBe('REVISE_REQUIRED');
    expect(result.blockingIssues).toEqual([]);
    expect(result.approvalRequirement).toBe('REVISION_REQUIRED');
    expect(result.revisionInstructions).toContainEqual(
      expect.objectContaining({ action: 'ALLOCATE_TRAINEES' }),
    );

    const exhausted = buildQaReviewResult({
      findings: [issue],
      score: 80,
      riskLevel: 'HIGH',
      initiatives: [initiative()],
      revisionCount: 2,
    });
    expect(exhausted.qaDecision).toBe('BLOCKED');
  });

  it('treats a documented external trainer fallback as a warning', () => {
    const result = buildQaReviewResult({
      findings: [
        finding({
          type: 'TRAINER_NOT_FOUND',
          severity: 'LOW',
          message: 'No internal trainer; external fallback is documented.',
        }),
      ],
      score: 95,
      riskLevel: 'LOW',
      initiatives: [
        initiative({
          trainerType: 'external',
          fallbackReason: 'SKILL_NOT_FOUND_INTERNAL',
          fallbackPlan: completeFallbackPlan,
        }),
      ],
      revisionCount: 0,
    });

    expect(result.qaDecision).toBe('PASS_WITH_WARNINGS');
  });

  it('requires revision when an initiative violates the prompt scope', () => {
    const result = buildQaReviewResult({
      findings: [
        finding({
          type: 'PROMPT_SCOPE_VIOLATION',
          severity: 'HIGH',
          message: 'Backend is outside the requested Frontend-only scope.',
        }),
      ],
      score: 80,
      riskLevel: 'HIGH',
      initiatives: [initiative({ skill: 'Backend' })],
      revisionCount: 0,
    });

    expect(result.qaDecision).toBe('REVISE_REQUIRED');
  });
});
