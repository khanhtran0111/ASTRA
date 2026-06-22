import { describe, expect, it } from 'vitest';
import type { RoadmapOutputAgent } from '../../src/backend/domain/qa/roadmap-output-loader.ts';
import { reviseRoadmap } from '../../src/backend/domain/revise-roadmap.ts';

const source: RoadmapOutputAgent = {
  runId: 'run-1',
  request: { userPrompt: 'Q3 2026 Frontend roadmap' },
  executionLog: ['Generated draft roadmap.'],
  revisionCount: 0,
  revisionHistory: [],
  initiatives: [
    {
      id: 'CLS-001',
      topic: 'System Design',
      priority: 'P1',
      score: 90,
      quarter: 'Q3 2026',
      targetTrainees: ['EMP-016'],
      trainerName: 'TRN-001',
      format: 'INTERNAL_TRAINING',
      formatExplanation: 'Internal trainer is available.',
      estimatedHours: 16,
      evidence: [
        {
          source: 'DS01',
          recordId: 'EMP-016',
          field: 'Skill_Gap',
          value: 'Automation Testing; System Design',
          reason: 'Direct skill-gap evidence.',
        },
      ],
    },
  ],
};

describe('Agent 1 roadmap revision', () => {
  it('marks missing project alignment for explicit human risk approval', () => {
    const revised = reviseRoadmap(source, [
      {
        initiativeId: 'CLS-001',
        issueType: 'MISSING_PROJECT_REQUIREMENT',
        action: 'CHANGE_ALIGNMENT_TYPE',
        message: 'No DS02 evidence exists; mark BOD_AND_SURVEY_ONLY.',
      },
    ]);

    expect(revised.revisionCount).toBe(1);
    expect(revised.initiatives[0]).toMatchObject({
      alignmentType: 'BOD_AND_SURVEY_ONLY',
      approvalRequired: true,
      alignmentNote: 'No direct project roadmap evidence found; requires L&D approval.',
    });
    expect(revised.executionLog).toContain(
      'Agent 1 revised the roadmap from Agent 2 instructions.',
    );
  });

  it('keeps the requested Docker initiative and reallocates only DS01-backed trainees', () => {
    const prompt =
      'Hãy tạo một training initiative Q3/2026 về Docker & Containerization Foundation cho Software Developer có skill gap Containerization trong DS01. Chỉ chọn tối đa 5 trainees có evidence rõ. Initiative này phục vụ PRJ-005 và GOAL-2026-07. Ưu tiên trainer nội bộ có expertise Docker; nếu không đủ capacity thì đề xuất self-study hoặc blended fallback.';
    const dockerSource: RoadmapOutputAgent = {
      ...source,
      request: { userPrompt: prompt },
      initiatives: [
        {
          ...source.initiatives[0]!,
          id: 'CLS-001',
          topic: 'Docker',
          targetTrainees: ['EMP-174'],
        },
        {
          ...source.initiatives[0]!,
          id: 'CLS-002',
          topic: 'Kubernetes',
          targetTrainees: ['EMP-174'],
        },
      ],
    };

    const revised = reviseRoadmap(dockerSource, [
      {
        initiativeId: 'CLS-001',
        issueType: 'NO_TRAINEE_EVIDENCE',
        action: 'ALLOCATE_TRAINEES',
        message: 'Allocate matching DS01 trainees.',
      },
      {
        initiativeId: 'CLS-002',
        issueType: 'PROMPT_SCOPE_VIOLATION',
        action: 'REMOVE_EXTRA_INITIATIVE',
        message: 'Remove the extra initiative.',
      },
    ]);

    expect(revised.initiatives).toHaveLength(1);
    expect(revised.initiatives[0]).toMatchObject({
      topic: 'Docker & Containerization Foundation',
      quarter: 'Q3 2026',
      targetTrainees: ['EMP-008', 'EMP-026', 'EMP-052', 'EMP-069', 'EMP-085'],
    });
    expect(revised.initiatives[0]?.traineeDetails).toHaveLength(5);
    expect(revised.initiatives[0]?.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'DS01', recordId: 'EMP-085', field: 'Skill_Gap' }),
        expect.objectContaining({ source: 'DS02', recordId: 'PRJ-005' }),
        expect.objectContaining({ source: 'DS05', recordId: 'GOAL-2026-07' }),
      ]),
    );
  });

  it('still removes an initiative when QA owns semantic scope classification', () => {
    const revised = reviseRoadmap(source, [
      {
        initiativeId: 'CLS-001',
        issueType: 'PROMPT_SCOPE_VIOLATION',
        action: 'REMOVE_EXTRA_INITIATIVE',
        message: 'Remove the semantically out-of-scope initiative.',
      },
    ]);

    expect(revised.initiatives).toEqual([]);
  });
});
