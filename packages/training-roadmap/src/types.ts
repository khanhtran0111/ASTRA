export type Priority = 'P1' | 'P2' | 'P3';
export type QaRisk = 'LOW' | 'MEDIUM' | 'HIGH';
export type ReviewStatus = 'pending' | 'approved' | 'revision_requested' | 'rejected';

export type QaFindingType =
  | 'INVALID_TRAINEE'
  | 'TRAINER_GAP'
  | 'MISSING_EVIDENCE'
  | 'TIMELINE_RISK'
  | 'BOD_ALIGNMENT_RISK'
  | 'MISSING_PROJECT_REQUIREMENT'
  | 'TRAINEE_MISMATCH'
  | 'TRACEABILITY_GAP';

export type TrainingInitiative = {
  id: string;
  topic: string;
  priority: Priority;
  score: number;
  quarter: string;
  targetTrainees: string[];
  trainerName: string | null;
  format: 'internal' | 'external' | 'self-study';
  formatExplanation?: string;
  evaluationCriteria?: string;
  durationWeeks?: number;
  estimatedHours: number;
  evidence: string[];
  fallbackReason?: string;
};

export type QaFinding = {
  type: QaFindingType;
  severity: QaRisk;
  message: string;
  skill?: string;
  relatedInitiativeId?: string;
  evidence: Array<{ path: string; value: unknown }>;
};

export type RoadmapResult = {
  runId: string;
  reviewStatus: ReviewStatus;
  executionLog: string[];
  initiatives: TrainingInitiative[];
  qaFindings: QaFinding[];
  qaScore: number;
  riskLevel: QaRisk;
  riskReason: string;
  evidencePack: Record<string, unknown>;
};

export type ApprovalDecision = Exclude<ReviewStatus, 'pending'>;

export type ApprovalResponse = {
  runId: string;
  reviewStatus: ApprovalDecision;
  approvalToken: string | null;
};
