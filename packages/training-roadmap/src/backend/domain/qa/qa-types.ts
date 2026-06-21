export type QaSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export type QaRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type QaFindingType =
  | 'INVALID_TRAINEE'
  | 'TRAINER_GAP'
  | 'MISSING_EVIDENCE'
  | 'BOD_ALIGNMENT_RISK'
  | 'MISSING_PROJECT_REQUIREMENT'
  | 'TRAINEE_MISMATCH'
  | 'TIMELINE_RISK'
  | 'TRACEABILITY_GAP'
  | 'REQUEST_SCOPE_MISMATCH';

export interface QaEvidence {
  path: string;
  value: unknown;
}

export interface QaFinding {
  type: QaFindingType;
  severity: QaSeverity;
  message: string;
  skill?: string;
  relatedInitiativeId?: string;
  evidence: QaEvidence[];
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
  quarter?: string;
  evidence?: string[];
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
  quarter?: string;
}

export interface QaPriorityResult {
  initiatives: QaPriorityInitiative[];
}
