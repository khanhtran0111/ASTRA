import { describe, expect, it } from 'vitest';
import { trainingRoadmapAgentSpecs } from '../../src/backend/agent-specs.ts';
import {
  DATA_FIRST_TOOL_IDS,
  QA_TOOL_IDS,
  trainingRoadmapAgentTools,
} from '../../src/backend/agent-tools.ts';

describe('training roadmap QA agent tools', () => {
  it('registers every QA rule and score operation as an agent tool', () => {
    const toolIds = trainingRoadmapAgentTools.map((tool) => (tool as { id: string }).id);
    const qaSpec = trainingRoadmapAgentSpecs.find(
      (spec) => spec.id === 'training-roadmap.qa-reviewer',
    );
    const coordinatorSpec = trainingRoadmapAgentSpecs.find((spec) => spec.id === 'lnd-coordinator');

    expect(toolIds).toEqual(expect.arrayContaining(Object.values(QA_TOOL_IDS)));
    expect(toolIds).toEqual(expect.arrayContaining(Object.values(DATA_FIRST_TOOL_IDS)));
    expect(trainingRoadmapAgentSpecs).toHaveLength(2);
    expect(qaSpec?.tools).toEqual(Object.values(QA_TOOL_IDS));
    expect(coordinatorSpec?.tools).toEqual(
      expect.arrayContaining([
        DATA_FIRST_TOOL_IDS.ingest,
        DATA_FIRST_TOOL_IDS.evidence,
        DATA_FIRST_TOOL_IDS.ontology,
        DATA_FIRST_TOOL_IDS.roadmap,
      ]),
    );
    expect(QA_TOOL_IDS.bodAlignment).toContain('analyzeBodAlignment');
    expect(QA_TOOL_IDS.projectRequirements).toContain('analyzeProjectRequirements');
  });
});
