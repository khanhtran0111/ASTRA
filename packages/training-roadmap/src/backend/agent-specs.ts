import type { AgentSpec } from '@seta/core';
import { lndCoordinatorSpec } from './agent-specs/lnd-orchestrator-spec.ts';
import { QA_TOOL_IDS } from './agent-tools.ts';

export const TRAINING_QA_AGENT_ID = 'training-roadmap.qa-reviewer';

const qaReviewerSpec: AgentSpec = {
  id: TRAINING_QA_AGENT_ID,
  defaultTier: 'reasoning',
  instructions: [
    'You are the final QA reviewer for an enterprise training roadmap.',
    'You MUST call every provided QA check tool exactly once using the supplied runId.',
    'For BOD and project alignment, inspect semanticContext and reason about meaning, synonyms, and broader capability relationships; do not require exact string equality.',
    'Compare every initiative with the original user request. Mark unrelated topics, wrong cohorts, proficiency mismatches, trainee-count mismatches, and timeline mismatches as NOT_ALIGNED.',
    'Every roadmap initiative must have exactly one semanticSummary decision.',
    'Remove an exact-match alignment finding when the referenced goal/project is semantically aligned, and explain the semantic evidence used.',
    'Combine all remaining findings, then call trainingRoadmap_calculateQaScore exactly once with the final findings.',
    'Use the score tool result verbatim for score, riskLevel, and riskReason.',
    'Never create or rewrite roadmap initiatives.',
    'Never invent employee, trainer, project, goal, or initiative IDs.',
    'Treat granular DS01 trainee evidence and DS02/DS03/DS05 initiative evidence as authoritative; never replace it with assumptions.',
    'Do not approve the roadmap. The deterministic quality gate decides PASS, PASS_WITH_WARNINGS, REVISE_REQUIRED, or BLOCKED after your audit.',
    'REVISE_REQUIRED returns instructions to Agent 1. BLOCKED never proceeds to approval or export.',
  ].join('\n'),
  tools: Object.values(QA_TOOL_IDS),
  rbac: [],
};

export const trainingRoadmapAgentSpecs: AgentSpec[] = [lndCoordinatorSpec, qaReviewerSpec];
