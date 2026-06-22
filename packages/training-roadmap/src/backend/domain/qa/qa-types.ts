import type {
  AlignmentType,
  EvidenceRef,
  FallbackPlan,
  QaFinding,
  QaFindingType,
  QaRisk,
} from '../../../types.ts';

export type QaSeverity = QaRisk;
export type QaRiskLevel = QaRisk;
export type { QaFinding, QaFindingType };

export interface QaEvidence {
  path: string;
  value: unknown;
}

export interface QaValidationResult {
  findings: QaFinding[];
  score: number;
  riskLevel: QaRiskLevel;
  riskReason: string;
  evidencePack: Record<string, unknown>;
}

export interface QaRoadmapItem {
  initiativeId?: string;
  skill: string;
  traineeIds?: string[];
  trainerType: 'internal' | 'external' | 'self-study';
  trainerId?: string | null;
  fallbackReason?: string;
  quarter?: string;
  evidence?: EvidenceRef[];
  alignmentType?: AlignmentType;
  approvalRequired?: boolean;
  alignmentNote?: string;
  fallbackPlan?: FallbackPlan;
}

export interface QaRoadmap {
  items: QaRoadmapItem[];
}

export interface QaNormalizedData {
  employees?: Array<{
    id: string;
    position?: string;
    proficiency?: string;
    currentSkills?: string[];
    targetSkills: string[];
  }>;
  trainers?: Array<{
    id: string;
    skills: string[];
    availableHours: number;
  }>;
  projects?: Array<{
    id: string;
    description?: string;
    requiredSkills?: string[];
    quarter?: string;
  }>;
  bodGoals?: Array<{
    id: string;
    description?: string;
    requiredSkills?: string[];
  }>;
  planningHorizon?: string;
}

export interface QaPriorityInitiative {
  id?: string;
  skill: string;
  target_employees?: string[];
  internal_trainer_available?: boolean;
  supporting_projects?: string[];
  supporting_bod_goals?: string[];
  evidence_summary?: string;
  evidence?: EvidenceRef[];
  quarter?: string;
  alignmentType?: AlignmentType;
  approvalRequired?: boolean;
  alignmentNote?: string;
  fallbackPlan?: FallbackPlan;
}

export interface QaPriorityResult {
  initiatives: QaPriorityInitiative[];
}
