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

export type EvidenceRef = {
  source: 'DS01' | 'DS02' | 'DS03' | 'DS04' | 'DS05';
  recordId: string;
  field: string;
  value: string;
  reason: string;
};

export type RevisionInstruction = {
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
};

export type QaFinding = {
  type:
    | 'NO_TRAINEE_EVIDENCE'
    | 'UNSUPPORTED_INITIATIVE'
    | 'MISSING_PROJECT_REQUIREMENT'
    | 'TRAINER_NOT_FOUND'
    | 'TIMELINE_MISMATCH'
    | 'PROMPT_SCOPE_VIOLATION'
    | 'BOD_ALIGNMENT_RISK'
    | 'TRACEABILITY_GAP';
  severity: QaRisk;
  message: string;
  skill?: string;
  relatedInitiativeId?: string;
  evidence: Array<{ path: string; value: unknown }>;
};

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
  alignmentType?: 'PROJECT_BACKED' | 'BOD_AND_SURVEY_ONLY';
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
  evidencePack?: Record<string, unknown>;
  reviewPack: {
    request: { userPrompt: string };
    generatedAt: string;
    initiativeCount: number;
    semanticSummary: unknown[];
    findings: QaFinding[];
  };
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

export type DatasetSourceSummary = {
  id: 'DS01' | 'DS02' | 'DS03' | 'DS04' | 'DS05';
  label: string;
  fileName: string;
  recordCount: number;
  detail: string;
  status: 'ready';
};

export type SkillGapSummary = {
  skill: string;
  employeeCount: number;
  percentOfWorkforce: number;
};

export type PriorityAnalysisItem = {
  skill: string;
  priority: Priority;
  score: number;
  targetEmployeeCount: number;
  supportingProjects: string[];
  supportingGoals: string[];
  internalTrainers: string[];
  evidenceSummary: string;
};

export type TrainerCoverageGap = {
  skill: string;
  priority: Priority;
  targetEmployeeCount: number;
};

export type TrainingAnalysisSnapshot = {
  pipelineVersion: string;
  runDate: string;
  scoringFormula: string;
  datasets: DatasetSourceSummary[];
  metrics: {
    employeesAnalyzed: number;
    employeesWithTargetGaps: number;
    uniqueTargetGapSkills: number;
    initiativesScored: number;
    internalTrainers: number;
    uncoveredSkills: number;
  };
  priorityCounts: Record<Priority, number>;
  skillGaps: SkillGapSummary[];
  priorities: PriorityAnalysisItem[];
  trainerCoverageGaps: TrainerCoverageGap[];
};
