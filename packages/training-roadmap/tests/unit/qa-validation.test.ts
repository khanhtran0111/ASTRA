import { describe, expect, it } from 'vitest';
import { qaValidateRoadmap } from '../../src/backend/domain/qa/qa-validate-roadmap.ts';

describe('training roadmap QA validation', () => {
  it('runs every QA-only rule with machine-readable evidence', async () => {
    const result = await qaValidateRoadmap({
      roadmap: {
        items: [
          {
            initiativeId: 'INIT-001',
            skill: 'Kubernetes',
            traineeIds: ['EMP-001', 'EMP-404'],
            trainerType: 'internal',
            quarter: 'Q1 2027',
            evidence: [
              {
                source: 'DS02',
                recordId: 'UNKNOWN-001',
                field: 'Required_Skills',
                value: 'Kubernetes',
                reason: 'Invalid reference used to exercise traceability.',
              },
            ],
          },
        ],
      },
      priorityResult: {
        initiatives: [
          {
            id: 'INIT-001',
            skill: 'Kubernetes',
            target_employees: ['EMP-001', 'EMP-404'],
            internal_trainer_available: false,
            supporting_projects: ['PRJ-001'],
            supporting_bod_goals: ['GOAL-001'],
            evidence_summary: 'Priority source evidence.',
            quarter: 'Q1 2027',
          },
        ],
      },
      normalizedData: {
        employees: [{ id: 'EMP-001', targetSkills: ['Docker'] }],
        trainers: [{ id: 'TRN-001', skills: ['Docker'], availableHours: 0 }],
        projects: [{ id: 'PRJ-001', requiredSkills: ['Docker'], quarter: 'Q3 2026' }],
        bodGoals: [{ id: 'GOAL-001', requiredSkills: ['Cloud'] }],
        planningHorizon: 'Q3 2026, Q4 2026',
      },
    });

    expect(result.findings.map((item) => item.type)).toEqual(
      expect.arrayContaining([
        'NO_TRAINEE_EVIDENCE',
        'TRAINER_NOT_FOUND',
        'UNSUPPORTED_INITIATIVE',
        'BOD_ALIGNMENT_RISK',
        'MISSING_PROJECT_REQUIREMENT',
        'TIMELINE_MISMATCH',
        'TRACEABILITY_GAP',
      ]),
    );
    expect(result.findings.every((item) => item.evidence.length > 0)).toBe(true);
    expect(result.evidencePack).toHaveProperty('priorityResult');
    expect(result.evidencePack).toHaveProperty('projects');
    expect(result.evidencePack).toHaveProperty('bodGoals');
  });

  it('reports missing evidence only when all three evidence sources are absent', async () => {
    const result = await qaValidateRoadmap({
      priorityResult: {
        initiatives: [
          {
            skill: 'Prompt Engineering',
            target_employees: [],
            internal_trainer_available: false,
            supporting_projects: [],
            supporting_bod_goals: [],
            evidence_summary: '',
            quarter: 'Q3 2026',
          },
        ],
      },
      normalizedData: { planningHorizon: 'Q3 2026' },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'UNSUPPORTED_INITIATIVE', severity: 'HIGH' }),
      ]),
    );
  });

  it('derives a roadmap from priority results when roadmap is omitted', async () => {
    const result = await qaValidateRoadmap({
      priorityResult: {
        initiatives: [
          {
            id: 'INIT-VALID',
            skill: 'Kubernetes',
            target_employees: ['EMP-001'],
            internal_trainer_available: true,
            supporting_projects: ['PRJ-001'],
            supporting_bod_goals: ['GOAL-001'],
            evidence_summary: 'Traceable evidence.',
            evidence: [
              {
                source: 'DS01',
                recordId: 'EMP-001',
                field: 'Skill_Gap',
                value: 'Kubernetes',
                reason: 'Direct employee gap.',
              },
              {
                source: 'DS02',
                recordId: 'PRJ-001',
                field: 'Required_Skills',
                value: 'Kubernetes',
                reason: 'Direct project requirement.',
              },
              {
                source: 'DS05',
                recordId: 'GOAL-001',
                field: 'Goal_Description',
                value: 'Kubernetes capability.',
                reason: 'Direct BOD alignment.',
              },
            ],
            quarter: 'Q3 2026',
          },
        ],
      },
      normalizedData: {
        employees: [{ id: 'EMP-001', targetSkills: ['Kubernetes'] }],
        trainers: [{ id: 'TRN-001', skills: ['Kubernetes'], availableHours: 8 }],
        projects: [{ id: 'PRJ-001', requiredSkills: ['Kubernetes'], quarter: 'Q3 2026' }],
        bodGoals: [{ id: 'GOAL-001', requiredSkills: ['Kubernetes'] }],
        planningHorizon: 'Q3-2026',
      },
    });

    expect(result.findings).toEqual([]);
    expect(result.score).toBe(100);
  });
});
