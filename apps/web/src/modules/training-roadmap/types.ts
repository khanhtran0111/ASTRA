export type Priority = 'P1' | 'P2' | 'P3';
export type QaRisk = 'LOW' | 'MEDIUM' | 'HIGH';
export type ReviewStatus = 'pending' | 'approved' | 'revision_requested' | 'rejected';

export type TrainingInitiative = {
  id: string;
  topic: string;
  priority: Priority;
  score: number;
  quarter: string;
  targetTrainees: string[];
  trainerName: string | null;
  format: 'internal' | 'external' | 'self-study';
  estimatedHours: number;
  evidence: string[];
  fallbackReason?: string;
};

export type QaFinding = {
  id: string;
  risk: QaRisk;
  message: string;
  relatedInitiativeId?: string;
};

export type RoadmapResult = {
  runId: string;
  reviewStatus: ReviewStatus;
  executionLog: string[];
  initiatives: TrainingInitiative[];
  qaFindings: QaFinding[];
};

export type ApprovalDecision = Exclude<ReviewStatus, 'pending'>;

export type ApprovalResponse = {
  runId: string;
  reviewStatus: ApprovalDecision;
  approvalToken: string | null;
};
