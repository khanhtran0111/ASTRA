import { describe, expect, it } from 'vitest';
import { generateDraftRoadmap } from '../../src/backend/domain/generate-roadmap.ts';
import type { MatchedTrainingClass } from '../../src/backend/domain/types.ts';

// ---------------------------------------------------------------------------
// Helper factory
// ---------------------------------------------------------------------------

function makeClass(overrides: Partial<MatchedTrainingClass> = {}): MatchedTrainingClass {
  return {
    classId: 'CLS-001',
    skillName: 'TypeScript',
    trainees: ['EMP-001', 'EMP-002'],
    assignedTrainer: 'TRN-001',
    isExternalRequired: false,
    targetQuarter: 'Q3_2026',
    evidence: { bodGoals: [], projectIds: [], surveyIds: [] },
    priorityScore: 80,
    estimatedHours: 12,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateDraftRoadmap
// ---------------------------------------------------------------------------

describe('generateDraftRoadmap', () => {
  it('groups classes by quarter', () => {
    const classes = [
      makeClass({ classId: 'CLS-001', targetQuarter: 'Q3_2026' }),
      makeClass({ classId: 'CLS-002', targetQuarter: 'Q4_2026' }),
      makeClass({ classId: 'CLS-003', targetQuarter: 'Q3_2026' }),
    ];

    const result = generateDraftRoadmap(classes);

    expect(Object.keys(result.quarters)).toEqual(expect.arrayContaining(['Q3_2026', 'Q4_2026']));
    expect(result.quarters['Q3_2026']).toHaveLength(2);
    expect(result.quarters['Q4_2026']).toHaveLength(1);
  });

  it('sets status to DRAFT', () => {
    const result = generateDraftRoadmap([makeClass()]);
    expect(result.status).toBe('DRAFT');
  });

  it('uses the provided roadmapId', () => {
    const result = generateDraftRoadmap([makeClass()], 'RM-CUSTOM-V2');
    expect(result.roadmapId).toBe('RM-CUSTOM-V2');
  });

  it('defaults roadmapId to RM-2026-V1', () => {
    const result = generateDraftRoadmap([makeClass()]);
    expect(result.roadmapId).toBe('RM-2026-V1');
  });

  it('sets generatedAt to an ISO timestamp', () => {
    const result = generateDraftRoadmap([makeClass()]);
    // Should parse as valid date
    expect(new Date(result.generatedAt).toISOString()).toBe(result.generatedAt);
  });

  it('maps class fields correctly to roadmap entry', () => {
    const cls = makeClass({
      classId: 'CLS-TEST',
      skillName: 'Kubernetes',
      priorityScore: 95,
      trainees: ['EMP-036', 'EMP-128'],
      estimatedHours: 16,
      assignedTrainer: 'TRN-004',
      isExternalRequired: false,
      evidence: {
        bodGoals: ['GOAL-2026-07'],
        projectIds: ['PRJ-009'],
        surveyIds: ['SUR_2025_Q4'],
      },
    });

    const result = generateDraftRoadmap([cls]);
    const entry = result.quarters['Q3_2026']![0]!;

    expect(entry.classId).toBe('CLS-TEST');
    expect(entry.topic).toBe('Kubernetes');
    expect(entry.priorityScore).toBe(95);
    expect(entry.traineeCount).toBe(2);
    expect(entry.trainees).toEqual(['EMP-036', 'EMP-128']);
    expect(entry.estimatedHours).toBe(16);
    expect(entry.alignmentEvidence.bodGoals).toEqual(['GOAL-2026-07']);
    expect(entry.alignmentEvidence.projects).toEqual(['PRJ-009']);
    expect(entry.resource.trainerId).toBe('TRN-004');
    expect(entry.resource.isExternalRequired).toBe(false);
    expect(entry.resource.fallbackReason).toBeNull();
  });

  it('maps fallback reason correctly', () => {
    const cls = makeClass({
      assignedTrainer: null,
      isExternalRequired: true,
      fallbackReason: 'SKILL_NOT_FOUND_INTERNAL',
    });

    const result = generateDraftRoadmap([cls]);
    const entry = result.quarters['Q3_2026']![0]!;

    expect(entry.resource.trainerId).toBeNull();
    expect(entry.resource.isExternalRequired).toBe(true);
    expect(entry.resource.fallbackReason).toBe('SKILL_NOT_FOUND_INTERNAL');
  });

  it('handles empty classes array', () => {
    const result = generateDraftRoadmap([]);
    expect(result.quarters).toEqual({});
  });
});
