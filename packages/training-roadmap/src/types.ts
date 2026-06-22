export type Priority = 'P1' | 'P2' | 'P3';
export type QaRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export type QaDecision = 'PASS' | 'PASS_WITH_WARNINGS' | 'REVISE_REQUIRED' | 'BLOCKED';

export type ApprovalRequirement =
  | 'NONE'
  | 'HUMAN_APPROVAL'
  | 'APPROVE_WITH_RISKS'
  | 'REVISION_REQUIRED'
  | 'BLOCKED';

export type ReviewStatus =
  | 'pending_review'
  | 'approved'
  | 'approved_with_risks'
  | 'revision_requested'
  | 'rejected'
  | 'blocked';

export type EvidenceSource = 'DS01' | 'DS02' | 'DS03' | 'DS04' | 'DS05';

export interface EvidenceRef {
  source: EvidenceSource;
  recordId: string;
  field: string;
  value: string;
  reason: string;
}

export type AlignmentType = 'PROJECT_BACKED' | 'BOD_AND_SURVEY_ONLY';

export type FallbackLearningMode =
  | 'self-study'
  | 'external'
  | 'study-group'
  | 'blended'
  | 'lab-based';

export interface FallbackMilestone {
  week: number;
  description: string;
  deliverable: string;
}

export interface FallbackPlan {
  learningMode: FallbackLearningMode;
  pic: string;
  materials: string[];
  milestones: FallbackMilestone[];
  estimatedHours: number;
  evaluationCriteria: string;
}

export interface CoverageResult {
  targetGroup: string;
  totalEligibleEmployees: number;
  requiredCoveragePercent: number;
  requiredTraineeCount: number;
  selectedTraineeCount: number;
  achievedCoveragePercent: number;
  coverageStatus: 'MET' | 'NOT_MET';
  missingTraineeCount: number;
}

export type QaFindingType =
  | 'NO_TRAINEE_EVIDENCE'
  | 'UNSUPPORTED_INITIATIVE'
  | 'MISSING_PROJECT_REQUIREMENT'
  | 'TRAINER_NOT_FOUND'
  | 'TIMELINE_MISMATCH'
  | 'PROMPT_SCOPE_VIOLATION'
  | 'BOD_ALIGNMENT_RISK'
  | 'TRACEABILITY_GAP';

export type QaFinding = {
  type: QaFindingType;
  severity: QaRisk;
  message: string;
  skill?: string;
  relatedInitiativeId?: string;
  evidence: Array<{ path: string; value: unknown }>;
};

export interface RevisionInstruction {
  initiativeId: string;
  issueType: string;
  action:
    | 'ADD_EVIDENCE'
    | 'DOWNGRADE_PRIORITY'
    | 'CHANGE_ALIGNMENT_TYPE'
    | 'REMOVE_INITIATIVE'
    | 'ADD_FALLBACK'
    | 'REQUEST_HUMAN_CONFIRMATION';
  message: string;
}

export interface QaReviewResult {
  qaDecision: QaDecision;
  qaScore: number;
  riskLevel: QaRisk;
  findings: QaFinding[];
  blockingIssues: QaFinding[];
  revisionInstructions: RevisionInstruction[];
  approvalRequirement: ApprovalRequirement;
  summary: string;
}

export type TrainingInitiative = {
  id: string;
  topic: string;
  priority: Priority;
  score: number;
  quarter: string;
  targetTrainees: string[];
  trainerName: string | null;
  objective?: string;
  prerequisites?: string[];
  format: 'internal' | 'external' | 'self-study';
  formatExplanation?: string;
  evaluationCriteria?: string;
  durationWeeks?: number;
  timeline?: { startWeek: number; endWeek: number };
  estimatedHours: number;
  evidence: EvidenceRef[];
  fallbackReason?: string;
  fallbackPlan?: FallbackPlan;
  alignmentType?: AlignmentType;
  approvalRequired?: boolean;
  alignmentNote?: string;
  riskFlags: QaFinding[];
};

export type RoadmapResult = {
  runId: string;
  reviewStatus: ReviewStatus;
  executionLog: string[];
  initiatives: TrainingInitiative[];
  qaDecision: QaDecision;
  qaFindings: QaFinding[];
  blockingIssues: QaFinding[];
  revisionInstructions: RevisionInstruction[];
  approvalRequirement: ApprovalRequirement;
  qaSummary: string;
  qaScore: number;
  riskLevel: QaRisk;
  riskReason: string;
  revisionCount: number;
  approvalToken?: string | null;
  approvalNotes?: string;
  approvedBy?: string;
  approvedAt?: string;
  evidencePack: Record<string, unknown>;
  reviewPack: {
    request: { userPrompt: string };
    generatedAt: string;
    initiativeCount: number;
    semanticSummary: unknown[];
    findings: QaFinding[];
  };
  coverageResult?: CoverageResult;
};

export type ApprovalDecision =
  | 'approved'
  | 'approved_with_risks'
  | 'revision_requested'
  | 'rejected';

export type ApprovalResponse = {
  runId: string;
  reviewStatus: ApprovalDecision;
  approvalToken: string | null;
  approvalNotes?: string;
  approvedBy?: string;
  approvedAt?: string;
};

export type RoadmapExportProposal = {
  runId: string;
  exportedAt: string;
  approvalToken: string | null;
  qaDecision: QaDecision;
  riskLevel: QaRisk;
  qaFindings: QaFinding[];
  approvalNotes: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  revisionCount: number;
  result: RoadmapResult;
};
