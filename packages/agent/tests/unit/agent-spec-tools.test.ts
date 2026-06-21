import { describe, expect, it } from 'vitest';
import { buildAgentFromSpec } from '../../src/register.ts';

describe('buildAgentFromSpec tool wiring', () => {
  it('fails boot when an AgentSpec references a tool missing from the contribution registry', () => {
    expect(() =>
      buildAgentFromSpec(
        {
          id: 'training-roadmap.qa-reviewer',
          instructions: 'test',
          tools: ['trainingRoadmap_checkTimelineFit'],
          rbac: [],
        },
        { model: {}, tools: new Map() },
      ),
    ).toThrow(
      'agent spec training-roadmap.qa-reviewer references unknown tool: trainingRoadmap_checkTimelineFit',
    );
  });
});
