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
            evidence: ['UNKNOWN-001'],
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
        'INVALID_TRAINEE',
        'TRAINER_GAP',
        'BOD_ALIGNMENT_RISK',
        'MISSING_PROJECT_REQUIREMENT',
        'TRAINEE_MISMATCH',
        'TIMELINE_RISK',
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
        expect.objectContaining({ type: 'MISSING_EVIDENCE', severity: 'MEDIUM' }),
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
