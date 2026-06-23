import { describe, expect, it } from 'vitest';
import { checkProjectRequirement } from '../../src/backend/domain/qa/rules/project-requirement.rule.ts';
import { checkTrainerGap } from '../../src/backend/domain/qa/rules/trainer-gap.rule.ts';

describe('reviewable roadmap risks', () => {
  it('keeps a missing DS02 project reviewable when DS01 or DS05 supports the skill', () => {
    const findings = checkProjectRequirement(
      {
        items: [
          {
            initiativeId: 'INIT-SD',
            skill: 'System Design',
            traineeIds: ['EMP-016'],
            trainerType: 'external',
          },
        ],
      },
      {
        initiatives: [
          {
            id: 'INIT-SD',
            skill: 'System Design',
            target_employees: ['EMP-016'],
            supporting_projects: [],
            supporting_bod_goals: ['GOAL-2026-08'],
          },
        ],
      },
      {
        employees: [{ id: 'EMP-016', targetSkills: ['System Design'] }],
        bodGoals: [{ id: 'GOAL-2026-08', requiredSkills: ['System Design'] }],
        projects: [],
      },
    );

    expect(findings).toEqual([
      expect.objectContaining({
        type: 'MISSING_PROJECT_REQUIREMENT',
        severity: 'MEDIUM',
      }),
    ]);
  });

  it('raises a high risk when DS02, DS01, and DS05 all lack skill support', () => {
    const findings = checkProjectRequirement(
      {
        items: [
          {
            initiativeId: 'INIT-QUANTUM',
            skill: 'Quantum Networking',
            traineeIds: ['EMP-016'],
            trainerType: 'external',
          },
        ],
      },
      {
        initiatives: [
          {
            id: 'INIT-QUANTUM',
            skill: 'Quantum Networking',
            target_employees: ['EMP-016'],
            supporting_projects: [],
            supporting_bod_goals: [],
          },
        ],
      },
      {
        employees: [{ id: 'EMP-016', targetSkills: ['React'] }],
        bodGoals: [],
        projects: [],
      },
    );

    expect(findings).toEqual([
      expect.objectContaining({
        type: 'MISSING_PROJECT_REQUIREMENT',
        severity: 'HIGH',
      }),
    ]);
  });

  it('requires documentation for a non-internal trainer fallback', () => {
    const findings = checkTrainerGap(
      {
        items: [
          {
            initiativeId: 'INIT-REACT',
            skill: 'React',
            trainerType: 'external',
          },
        ],
      },
      { initiatives: [{ id: 'INIT-REACT', skill: 'React' }] },
      { trainers: [] },
    );

    expect(findings).toEqual([
      expect.objectContaining({
        type: 'TRAINER_NOT_FOUND',
        severity: 'MEDIUM',
        message: expect.stringContaining('no fallback is documented'),
      }),
    ]);
  });
});
