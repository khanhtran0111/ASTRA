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
  objective?: string;
  prerequisites?: string[];
  format: string;
  formatExplanation?: string;
  evaluationCriteria?: string;
  durationWeeks?: number;
  timeline?: { startWeek: number; endWeek: number };
  estimatedHours: number;
  evidence: string[];
  fallbackReason?: string;
  riskFlags: QaFinding[];
};

export type QaFinding = {
  type:
    | 'INVALID_TRAINEE'
    | 'TRAINER_GAP'
    | 'MISSING_EVIDENCE'
    | 'TIMELINE_RISK'
    | 'BOD_ALIGNMENT_RISK'
    | 'TRACEABILITY_GAP'
    | 'REQUEST_SCOPE_MISMATCH';
  severity: QaRisk;
  message: string;
  skill?: string;
  relatedInitiativeId?: string;
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
  evidencePack?: Record<string, unknown>;
  reviewPack: {
    request: { userPrompt: string };
    generatedAt: string;
    initiativeCount: number;
    semanticSummary: unknown[];
    findings: QaFinding[];
  };
};

export type ApprovalDecision = Exclude<ReviewStatus, 'pending'>;

export type ApprovalResponse = {
  runId: string;
  reviewStatus: ApprovalDecision;
  approvalToken: string | null;
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
