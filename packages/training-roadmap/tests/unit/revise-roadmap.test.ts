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
});
