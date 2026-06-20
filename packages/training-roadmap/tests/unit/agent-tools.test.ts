import { describe, expect, it } from 'vitest';
import { trainingRoadmapAgentSpecs } from '../../src/backend/agent-specs.ts';
import { QA_TOOL_IDS, trainingRoadmapAgentTools } from '../../src/backend/agent-tools.ts';

describe('training roadmap QA agent tools', () => {
  it('registers every QA rule and score operation as an agent tool', () => {
    const toolIds = trainingRoadmapAgentTools.map((tool) => (tool as { id: string }).id);

    expect(toolIds).toEqual(Object.values(QA_TOOL_IDS));
    expect(trainingRoadmapAgentSpecs).toHaveLength(1);
    expect(trainingRoadmapAgentSpecs[0]?.tools).toEqual(toolIds);
    expect(QA_TOOL_IDS.bodAlignment).toContain('analyzeBodAlignment');
    expect(QA_TOOL_IDS.projectRequirements).toContain('analyzeProjectRequirements');
  });
});
