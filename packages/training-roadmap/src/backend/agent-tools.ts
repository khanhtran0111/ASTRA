import type { AgentTool } from '@seta/agent-sdk';
import {
  lndAssignLearningFormats,
  lndCompileQuarterlyRoadmap,
  lndFindAndAssignTrainer,
  lndGetPendingSkills,
} from './agent-tools/roadmap-tools.ts';

export const trainingRoadmapAgentTools: AgentTool[] = [
  lndGetPendingSkills as any,
  lndFindAndAssignTrainer as any,
  lndAssignLearningFormats as any,
  lndCompileQuarterlyRoadmap as any,
];
