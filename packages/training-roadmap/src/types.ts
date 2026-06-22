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

export interface AllocatedTrainee {
  employeeId: string;
  employeeName?: string;
  position: string;
  team?: string;
  proficiencyLevel: string;
  matchedSkillGap: string[];
  evidenceRefs: EvidenceRef[];
  reason: string;
}

export interface RoadmapTrainerCandidate {
  trainerId: string;
  fitScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  capacityStatus: 'FULL' | 'PARTIAL' | 'NONE';
  availabilityHoursPerMonth: number;
  evidenceRefs: EvidenceRef[];
}

export interface RoadmapScoreBreakdown {
  bodAlignment: number;
  projectUrgency: number;
  traineeGapImpact: number;
  surveyDemand: number;
  feasibility: number;
  marketTrend: number;
  riskPenalty: number;
}

export interface DataInventorySummary {
  sourceId: 'DS01' | 'DS02' | 'DS03' | 'DS04' | 'DS05' | 'MARKET';
  fileName: string;
  rowCount: number;
  validRows: number;
  invalidRows: number;
  skippedRows: number;
  detectedColumns: string[];
  warnings: string[];
}

export interface DataCoverageReport {
  totalRecordsBySource: Record<string, number>;
  validRecordsBySource: Record<string, number>;
  candidateCount: number;
  selectedCount: number;
  droppedCount: number;
  unmatchedSkills: string[];
  unmatchedTraineeRows: string[];
  unmatchedTrainerRows: string[];
  warnings: string[];
  coverageResult?: CoverageResult;
}

export interface UnselectedCandidateSummary {
  candidate: string;
  reasonDropped: string;
  evidenceRefs: EvidenceRef[];
  suggestedFix: string;
}

export interface RoadmapToolTraceEntry {
  tool: string;
  status: 'completed';
  detail: string;
}

export interface DataRevisionAction {
  issueCode: string;
  affectedItemId: string;
  blockingLevel: QaRisk;
  requiredToolToRerun: string;
  expectedFix: string;
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
  | 'COVERAGE_SHORTFALL'
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
    | 'ALLOCATE_TRAINEES'
    | 'FILTER_SCOPE'
    | 'ADD_SUPPORTING_PROJECT'
    | 'RETRY_TRAINER_MATCH_WITH_ALIASES'
    | 'DOWNGRADE_PRIORITY'
    | 'CHANGE_ALIGNMENT_TYPE'
    | 'REMOVE_EXTRA_INITIATIVE'
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
  traineeDetails?: AllocatedTrainee[];
  canonicalSkillId?: string;
  trainerCandidates?: RoadmapTrainerCandidate[];
  selectedTrainer?: string | null;
  totalHours?: number;
  trainerContactHours?: number;
  selfStudyHours?: number;
  labHours?: number;
  scoreBreakdown?: RoadmapScoreBreakdown;
  selectionReason?: string;
  risks?: string[];
  requiresHumanApproval?: boolean;
  deliveryFormat?: string;
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
  dataInventory?: DataInventorySummary[];
  dataCoverageReport?: DataCoverageReport;
  unselectedCandidates?: UnselectedCandidateSummary[];
  toolTrace?: RoadmapToolTraceEntry[];
  dataRevisionActions?: DataRevisionAction[];
};

export type ApprovalDecision =
  | 'approved'
  | 'approved_with_risks'
  | 'revision_requested'
  | 'rejected';

export type HumanFeedback = {
  runId: string;
  feedback: string;
  createdAt: string;
  reviewerId?: string | null;
};

export type RoadmapVersion = {
  runId: string;
  version: number;
  feedback?: string;
  roadmap: RoadmapResult;
  createdAt: string;
};

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
