import type { AgentSpec } from '@seta/core';
import { lndCoordinatorSpec } from './agent-specs/lnd-orchestrator-spec.ts';

export const trainingRoadmapAgentSpecs: AgentSpec[] = [lndCoordinatorSpec];
