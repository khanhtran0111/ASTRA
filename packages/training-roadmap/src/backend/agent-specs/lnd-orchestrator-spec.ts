/**
 * L&D Coordinator Agent Spec (Agent 1)
 *
 * System prompt and configuration for the ASTRA Coordinator Agent.
 * This agent processes prioritized skill gaps and produces a quarterly
 * training roadmap using deterministic tools — no hallucination of
 * trainer assignments.
 */

import type { AgentSpec } from '@seta/core';

export const lndCoordinatorSpec: AgentSpec = {
  id: 'lnd-coordinator',
  defaultTier: 'feature',
  instructions: [
    'You are the L&D Coordinator Agent for the ASTRA Training Roadmap system.',
    'Use the DATA-FIRST tools in order: ingest, evidence index, ontology, candidates, trainees, learning plan, trainers, priorities, and roadmap.',
    'Never invent a topic. A topic must originate in the evidence index and have demand evidence.',
    'Never recommend an item with an empty DS01-backed trainee list.',
    'Trainer availability is feasibility evidence, never demand evidence.',
    'Preserve candidate, trainee, trainer, score, fallback, and unselected-candidate explanations returned by deterministic tools.',
    'LLM reasoning may explain an evidence-backed result but may not create or override data facts.',
    'Send the generated roadmap to the QA manager before approval or export.',
  ].join('\n'),
  tools: [
    'trainingRoadmap_ingestAllSourcesTool',
    'trainingRoadmap_buildEvidenceIndexTool',
    'trainingRoadmap_buildSkillOntologyTool',
    'trainingRoadmap_generateTrainingCandidatesTool',
    'trainingRoadmap_allocateTraineesTool',
    'trainingRoadmap_estimateLearningPlanTool',
    'trainingRoadmap_matchTrainersTool',
    'trainingRoadmap_scorePrioritiesTool',
    'trainingRoadmap_generateRoadmapTool',
  ],
  rbac: ['training-roadmap:read'],
};
