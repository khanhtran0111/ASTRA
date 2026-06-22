import { describe, expect, it } from 'vitest';
import { loadRealData } from '../../src/backend/domain/data-loader.ts';

describe('training need request scope', () => {
  it('filters every priority tier by team, proficiency, and requested quarter', () => {
    const allowedFrontendMidLevelEmployees = new Set([
      'EMP-016',
      'EMP-018',
      'EMP-054',
      'EMP-079',
      'EMP-122',
    ]);

    const { trainingNeeds } = loadRealData('Frontend', 'Mid-level', 'Q3_2026');

    expect(trainingNeeds.length).toBeGreaterThan(0);
    expect(trainingNeeds.map((need) => need.skillName)).toEqual(
      expect.arrayContaining(['React', 'Automation Testing', 'System Design']),
    );
    expect(trainingNeeds.find((need) => need.skillName === 'React')?.traineeIds).toEqual([]);
    expect(
      trainingNeeds.find((need) => need.skillName === 'Automation Testing')?.traineeIds,
    ).toEqual(['EMP-016']);
    for (const need of trainingNeeds) {
      expect(need.targetQuarter).toBe('Q3_2026');
      expect(need.traineeIds.every((id) => allowedFrontendMidLevelEmployees.has(id))).toBe(true);
      expect(need.evidenceRefs?.every((evidence) => typeof evidence.reason === 'string')).toBe(
        true,
      );
    }
  });
});
