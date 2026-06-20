/**
 * Domain types for the L&D Coordinator Agent (Agent 1).
 *
 * These types form the contract between the Skill Gap Analyzer (Member 1),
 * the Coordinator (this module), and the QA Agent (Member 4).
 */

// ---------------------------------------------------------------------------
// Fallback reasons — deterministic, no LLM guessing
// ---------------------------------------------------------------------------

export type FallbackReason = 'SKILL_NOT_FOUND_INTERNAL' | 'CAPACITY_EXCEEDED';

export type LearningFormat =
  | 'INTERNAL_TRAINING' // Khóa đào tạo nội bộ
  | 'ON_JOB_TRAINING' // On-job training
  | 'GROUP_STUDY' // Tự học nhóm
  | 'EXTERNAL_TRAINER' // Thuê trainer external
  | 'ONLINE_COURSE' // Khóa học online
  | 'SEMINAR_SHARING'; // Các buổi/series chia sẻ

// ---------------------------------------------------------------------------
// Input: from Skill Gap Analyzer (Member 1)
// ---------------------------------------------------------------------------

export interface ScoredTrainingNeed {
  needId: string;
  /** Skill name, already normalized (e.g. "Kubernetes") */
  skillName: string;
  /** Priority score — higher means more urgent (e.g. 95) */
  priorityScore: number;
  /** Employee IDs that need this training */
  traineeIds: string[];
  /** Total estimated hours for the course (e.g. 16) */
  estimatedHours: number;
  /** Target quarter (e.g. "Q3_2026") */
  targetQuarter: string;
  /** Traceability evidence linking back to business drivers */
  evidence: {
    bodGoals: string[];
    projectIds: string[];
    surveyIds: string[];
  };
}

// ---------------------------------------------------------------------------
// Internal Trainer Pool
// ---------------------------------------------------------------------------

export interface InternalTrainer {
  trainerId: string;
  /** Skill areas the trainer can teach (e.g. ["Java", "Spring Boot"]) */
  expertise: string[];
  /** Maximum hours available per month for training delivery */
  availabilityHoursPerMonth: number;
}

// ---------------------------------------------------------------------------
// Output: Match result for a single training class
// ---------------------------------------------------------------------------

export interface MatchedTrainingClass {
  classId: string;
  skillName: string;
  trainees: string[];
  /** Assigned trainer ID, or null when external resource is needed */
  assignedTrainer: string | null;
  isExternalRequired: boolean;
  fallbackReason?: FallbackReason;
  learningFormat?: LearningFormat;
  targetQuarter: string;
  evidence: {
    bodGoals: string[];
    projectIds: string[];
    surveyIds: string[];
  };
  /** Carried from the original ScoredTrainingNeed for roadmap generation */
  priorityScore: number;
  estimatedHours: number;
  formatExplanation?: string;
  evaluationCriteria?: string;
  durationWeeks?: number;
}

// ---------------------------------------------------------------------------
// Output: Draft Roadmap JSON — the final deliverable for QA Agent
// ---------------------------------------------------------------------------

export interface RoadmapClassEntry {
  classId: string;
  topic: string;
  priorityScore: number;
  alignmentEvidence: {
    bodGoals: string[];
    projects: string[];
  };
  traineeCount: number;
  trainees: string[];
  estimatedHours: number;
  learningFormat?: LearningFormat;
  formatExplanation?: string;
  evaluationCriteria?: string;
  durationWeeks?: number;
  resource: {
    trainerId: string | null;
    isExternalRequired: boolean;
    fallbackReason: FallbackReason | null;
  };
}

export interface DraftRoadmapOutput {
  roadmapId: string;
  status: 'DRAFT';
  generatedAt: string;
  quarters: Record<string, RoadmapClassEntry[]>;
}
