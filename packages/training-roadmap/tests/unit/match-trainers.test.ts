import { describe, expect, it } from 'vitest';
import { matchTrainers, requiredHoursPerMonth } from '../../src/backend/domain/match-trainers.ts';
import type { InternalTrainer, ScoredTrainingNeed } from '../../src/backend/domain/types.ts';

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeNeed(overrides: Partial<ScoredTrainingNeed> = {}): ScoredTrainingNeed {
  return {
    needId: 'NEED-TEST',
    skillName: 'TypeScript',
    priorityScore: 80,
    traineeIds: ['EMP-001', 'EMP-002'],
    estimatedHours: 12,
    targetQuarter: 'Q3_2026',
    evidence: { bodGoals: [], projectIds: [], surveyIds: [] },
    ...overrides,
  };
}

function makeTrainer(overrides: Partial<InternalTrainer> = {}): InternalTrainer {
  return {
    trainerId: 'TRN-TEST',
    expertise: ['TypeScript', 'Node.js'],
    availabilityHoursPerMonth: 8,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// requiredHoursPerMonth
// ---------------------------------------------------------------------------

describe('requiredHoursPerMonth', () => {
  it('divides by 3 and rounds up', () => {
    expect(requiredHoursPerMonth(12)).toBe(4); // 12/3 = 4 exact
    expect(requiredHoursPerMonth(16)).toBe(6); // 16/3 = 5.33 → ceil 6
    expect(requiredHoursPerMonth(24)).toBe(8); // 24/3 = 8 exact
    expect(requiredHoursPerMonth(8)).toBe(3); // 8/3 = 2.67 → ceil 3
    expect(requiredHoursPerMonth(1)).toBe(1); // 1/3 = 0.33 → ceil 1
  });
});

// ---------------------------------------------------------------------------
// matchTrainers
// ---------------------------------------------------------------------------

describe('matchTrainers', () => {
  it('assigns a trainer when skill matches and capacity is sufficient', () => {
    const needs = [makeNeed({ estimatedHours: 12 })]; // 4h/month needed
    const trainers = [makeTrainer({ availabilityHoursPerMonth: 8 })]; // 8h/month available

    const result = matchTrainers(needs, trainers);

    expect(result).toHaveLength(1);
    expect(result[0]!.assignedTrainer).toBe('TRN-TEST');
    expect(result[0]!.isExternalRequired).toBe(false);
    expect(result[0]!.fallbackReason).toBeUndefined();
  });

  it('flags SKILL_NOT_FOUND_INTERNAL when no trainer has the skill', () => {
    const needs = [makeNeed({ skillName: 'Penetration Testing' })];
    const trainers = [makeTrainer({ expertise: ['Java', 'Spring Boot'] })];

    const result = matchTrainers(needs, trainers);

    expect(result).toHaveLength(1);
    expect(result[0]!.assignedTrainer).toBeNull();
    expect(result[0]!.isExternalRequired).toBe(true);
    expect(result[0]!.fallbackReason).toBe('SKILL_NOT_FOUND_INTERNAL');
  });

  it('flags CAPACITY_EXCEEDED when trainer has skill but insufficient hours', () => {
    // 24h course → ceil(24/3) = 8h/month needed, but trainer only has 4h/month
    const needs = [makeNeed({ estimatedHours: 24 })];
    const trainers = [makeTrainer({ availabilityHoursPerMonth: 4 })];

    const result = matchTrainers(needs, trainers);

    expect(result).toHaveLength(1);
    expect(result[0]!.assignedTrainer).toBeNull();
    expect(result[0]!.isExternalRequired).toBe(true);
    expect(result[0]!.fallbackReason).toBe('CAPACITY_EXCEEDED');
  });

  it('higher-priority need gets the trainer; lower-priority same-skill need gets fallback', () => {
    // Two needs for the same skill, one trainer with 4h/month capacity.
    // First need: 12h (4h/month) — exactly fills capacity.
    // Second need: 12h (4h/month) — no capacity left.
    const needs = [
      makeNeed({ needId: 'HIGH', priorityScore: 95, estimatedHours: 12 }),
      makeNeed({ needId: 'LOW', priorityScore: 60, estimatedHours: 12 }),
    ];
    const trainers = [makeTrainer({ availabilityHoursPerMonth: 4 })];

    const result = matchTrainers(needs, trainers);

    expect(result).toHaveLength(2);
    // High priority gets assigned
    expect(result[0]!.classId).toBe('CLS-001');
    expect(result[0]!.assignedTrainer).toBe('TRN-TEST');
    expect(result[0]!.isExternalRequired).toBe(false);
    // Low priority gets fallback — same trainer, but capacity exhausted
    expect(result[1]!.classId).toBe('CLS-002');
    expect(result[1]!.assignedTrainer).toBeNull();
    expect(result[1]!.isExternalRequired).toBe(true);
    expect(result[1]!.fallbackReason).toBe('CAPACITY_EXCEEDED');
  });

  it('falls back to second trainer when first is exhausted', () => {
    const needs = [
      makeNeed({ needId: 'FIRST', priorityScore: 90, estimatedHours: 12 }),
      makeNeed({ needId: 'SECOND', priorityScore: 80, estimatedHours: 12 }),
    ];
    const trainers = [
      makeTrainer({ trainerId: 'TRN-A', availabilityHoursPerMonth: 4 }),
      makeTrainer({ trainerId: 'TRN-B', availabilityHoursPerMonth: 8 }),
    ];

    const result = matchTrainers(needs, trainers);

    expect(result).toHaveLength(2);
    // First need assigned to TRN-A (first match, capacity = 4, needs 4)
    expect(result[0]!.assignedTrainer).toBe('TRN-A');
    // Second need — TRN-A exhausted, falls to TRN-B (capacity = 8, needs 4)
    expect(result[1]!.assignedTrainer).toBe('TRN-B');
    expect(result[1]!.isExternalRequired).toBe(false);
  });

  it('handles case-insensitive skill matching', () => {
    const needs = [makeNeed({ skillName: 'typescript' })]; // lowercase
    const trainers = [makeTrainer({ expertise: ['TypeScript'] })]; // PascalCase

    const result = matchTrainers(needs, trainers);

    expect(result[0]!.assignedTrainer).toBe('TRN-TEST');
    expect(result[0]!.isExternalRequired).toBe(false);
  });

  it('returns empty array for empty needs', () => {
    const result = matchTrainers([], [makeTrainer()]);
    expect(result).toEqual([]);
  });

  it('generates sequential class IDs', () => {
    const needs = [
      makeNeed({ needId: 'A', priorityScore: 90 }),
      makeNeed({ needId: 'B', priorityScore: 80 }),
      makeNeed({ needId: 'C', priorityScore: 70 }),
    ];
    const trainers = [makeTrainer({ availabilityHoursPerMonth: 100 })];

    const result = matchTrainers(needs, trainers);

    expect(result.map((r) => r.classId)).toEqual(['CLS-001', 'CLS-002', 'CLS-003']);
  });

  it('carries evidence and metadata from the original need', () => {
    const needs = [
      makeNeed({
        skillName: 'React',
        traineeIds: ['EMP-100', 'EMP-200'],
        estimatedHours: 16,
        targetQuarter: 'Q4_2026',
        evidence: {
          bodGoals: ['GOAL-2026-03'],
          projectIds: ['PRJ-011'],
          surveyIds: ['SUR_2025_Q4'],
        },
      }),
    ];
    const trainers = [makeTrainer({ expertise: ['React'], availabilityHoursPerMonth: 8 })];

    const result = matchTrainers(needs, trainers);

    expect(result[0]!.trainees).toEqual(['EMP-100', 'EMP-200']);
    expect(result[0]!.targetQuarter).toBe('Q4_2026');
    expect(result[0]!.evidence.bodGoals).toEqual(['GOAL-2026-03']);
    expect(result[0]!.priorityScore).toBe(80);
    expect(result[0]!.estimatedHours).toBe(16);
  });
});
