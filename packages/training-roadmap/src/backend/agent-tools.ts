import type { AgentTool } from '@seta/agent-sdk';
import {
  lndAssignLearningFormats,
  lndCompileQuarterlyRoadmap,
  lndFindAndAssignTrainer,
  lndGetPendingSkills,
} from './agent-tools/roadmap-tools.ts';

export const trainingRoadmapAgentTools: AgentTool[] = [
  lndGetPendingSkills as unknown as AgentTool,
  lndFindAndAssignTrainer as unknown as AgentTool,
  lndAssignLearningFormats as unknown as AgentTool,
  lndCompileQuarterlyRoadmap as unknown as AgentTool,
];
