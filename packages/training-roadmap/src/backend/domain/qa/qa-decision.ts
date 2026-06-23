import type {
  ApprovalRequirement,
  QaDecision,
  QaFinding,
  QaReviewResult,
  RevisionInstruction,
} from '../../../types.ts';
import type { QaRiskLevel, QaRoadmapItem } from './qa-types.ts';

const BLOCKING_TYPES = new Set<QaFinding['type']>(['UNSUPPORTED_INITIATIVE']);

const REVISION_TYPES = new Set<QaFinding['type']>([
  'TIMELINE_MISMATCH',
  'PROMPT_SCOPE_VIOLATION',
  'TRACEABILITY_GAP',
]);

function initiativeFor(
  finding: QaFinding,
  initiatives: QaRoadmapItem[],
): QaRoadmapItem | undefined {
  return initiatives.find(
    (initiative) =>
      initiative.initiativeId === finding.relatedInitiativeId || initiative.skill === finding.skill,
  );
}

function isResolvedMissingProject(finding: QaFinding, initiatives: QaRoadmapItem[]): boolean {
  const initiative = initiativeFor(finding, initiatives);
  return (
    initiative?.alignmentType === 'BOD_AND_SURVEY_ONLY' &&
    initiative.approvalRequired === true &&
    Boolean(initiative.alignmentNote?.trim())
  );
}

function toInstruction(finding: QaFinding, initiatives: QaRoadmapItem[]): RevisionInstruction {
  const initiativeId = finding.relatedInitiativeId ?? 'ROADMAP';

  if (finding.type === 'MISSING_PROJECT_REQUIREMENT') {
    if (isResolvedMissingProject(finding, initiatives)) {
      return {
        initiativeId,
        issueType: finding.type,
        action: 'REQUEST_HUMAN_CONFIRMATION',
        message:
          'No direct DS02 project requirement exists. Keep BOD_AND_SURVEY_ONLY alignment and require approve-with-risks.',
      };
    }
    return {
      initiativeId,
      issueType: finding.type,
      action: 'CHANGE_ALIGNMENT_TYPE',
      message:
        'No DS02 project requires this skill directly. Mark it BOD_AND_SURVEY_ONLY, downgrade priority if needed, and require L&D risk approval.',
    };
  }

  if (finding.type === 'TRAINER_NOT_FOUND') {
    return {
      initiativeId,
      issueType: finding.type,
      action: 'ADD_FALLBACK',
      message: 'Keep trainerName null and document an external or self-study fallback.',
    };
  }

  if (finding.type === 'PROMPT_SCOPE_VIOLATION') {
    return {
      initiativeId,
      issueType: finding.type,
      action: 'REMOVE_EXTRA_INITIATIVE',
      message:
        'Filter the roadmap to the requested topic/count and remove extra out-of-scope initiatives.',
    };
  }

  if (finding.type === 'TIMELINE_MISMATCH') {
    return {
      initiativeId,
      issueType: finding.type,
      action: 'REMOVE_INITIATIVE',
      message:
        'Move the initiative into the requested quarter or remove it when no valid slot exists.',
    };
  }

  if (finding.type === 'NO_TRAINEE_EVIDENCE') {
    return {
      initiativeId,
      issueType: finding.type,
      action: 'ALLOCATE_TRAINEES',
      message:
        'Select DS01-backed trainees matching the requested role, proficiency, and skill-gap constraints.',
    };
  }

  return {
    initiativeId,
    issueType: finding.type,
    action: 'ADD_EVIDENCE',
    message: 'Attach a valid granular source record or remove the unsupported initiative.',
  };
}

function approvalRequirement(decision: QaDecision): ApprovalRequirement {
  if (decision === 'PASS') return 'HUMAN_APPROVAL';
  if (decision === 'PASS_WITH_WARNINGS') return 'APPROVE_WITH_RISKS';
  if (decision === 'REVISE_REQUIRED') return 'REVISION_REQUIRED';
  return 'BLOCKED';
}

type FallbackPlanLike = {
  learningMode?: unknown;
  pic?: unknown;
  materials?: unknown;
  milestones?: unknown;
  estimatedHours?: unknown;
  evaluationCriteria?: unknown;
};

function isFallbackPlanComplete(plan: unknown): boolean {
  if (!plan || typeof plan !== 'object') return false;

  const fallbackPlan = plan as FallbackPlanLike;
  return (
    Boolean(fallbackPlan.learningMode) &&
    Boolean(fallbackPlan.pic) &&
    Array.isArray(fallbackPlan.materials) &&
    fallbackPlan.materials.length > 0 &&
    Array.isArray(fallbackPlan.milestones) &&
    fallbackPlan.milestones.length > 0 &&
    typeof fallbackPlan.estimatedHours === 'number' &&
    fallbackPlan.estimatedHours > 0 &&
    Boolean(fallbackPlan.evaluationCriteria)
  );
}

function hasDocumentedTrainerFallback(initiative: QaRoadmapItem | undefined): boolean {
  return Boolean(initiative?.fallbackReason) && isFallbackPlanComplete(initiative?.fallbackPlan);
}

export function partitionQaFindings(args: {
  findings: QaFinding[];
  initiatives: QaRoadmapItem[];
}): { unresolvedFindings: QaFinding[]; resolvedWarnings: QaFinding[] } {
  const unresolvedFindings: QaFinding[] = [];
  const resolvedWarnings: QaFinding[] = [];

  for (const finding of args.findings) {
    const initiative = initiativeFor(finding, args.initiatives);
    const resolved =
      (finding.type === 'MISSING_PROJECT_REQUIREMENT' &&
        isResolvedMissingProject(finding, args.initiatives)) ||
      (finding.type === 'TRAINER_NOT_FOUND' && hasDocumentedTrainerFallback(initiative));
    (resolved ? resolvedWarnings : unresolvedFindings).push(finding);
  }

  return { unresolvedFindings, resolvedWarnings };
}

export function buildQaReviewResult(args: {
  findings: QaFinding[];
  score: number;
  riskLevel: QaRiskLevel;
  initiatives: QaRoadmapItem[];
  revisionCount: number;
}): QaReviewResult {
  const { unresolvedFindings, resolvedWarnings } = partitionQaFindings({
    findings: args.findings,
    initiatives: args.initiatives,
  });
  const blockingIssues = unresolvedFindings.filter(
    (finding) =>
      BLOCKING_TYPES.has(finding.type) ||
      (finding.type === 'NO_TRAINEE_EVIDENCE' && args.revisionCount >= 2),
  );

  const needsRevision = unresolvedFindings.some((finding) => {
    if (BLOCKING_TYPES.has(finding.type)) return false;
    if (finding.type === 'NO_TRAINEE_EVIDENCE') return args.revisionCount < 2;
    if (REVISION_TYPES.has(finding.type)) return true;
    if (finding.type === 'MISSING_PROJECT_REQUIREMENT') return true;
    if (finding.type === 'TRAINER_NOT_FOUND') return true;
    return finding.severity === 'HIGH' && !BLOCKING_TYPES.has(finding.type);
  });

  let qaDecision: QaDecision;
  if (blockingIssues.length > 0) qaDecision = 'BLOCKED';
  else if (needsRevision) qaDecision = 'REVISE_REQUIRED';
  else if (args.findings.length > 0) qaDecision = 'PASS_WITH_WARNINGS';
  else qaDecision = 'PASS';

  const revisionInstructions = unresolvedFindings.map((finding) =>
    toInstruction(finding, args.initiatives),
  );
  const summary =
    qaDecision === 'PASS'
      ? 'QA passed with no unresolved findings. Human approval is required before export.'
      : qaDecision === 'PASS_WITH_WARNINGS'
        ? `${args.findings.length} warning(s), including ${resolvedWarnings.length} resolved by documented controls, require explicit human approval with risks.`
        : qaDecision === 'REVISE_REQUIRED'
          ? `${revisionInstructions.length} revision instruction(s) must return to Agent 1.`
          : `${blockingIssues.length} blocking issue(s) prevent approval and export.`;

  return {
    qaDecision,
    qaScore: args.score,
    riskLevel: args.riskLevel,
    findings: args.findings,
    blockingIssues,
    revisionInstructions,
    approvalRequirement: approvalRequirement(qaDecision),
    summary,
  };
}
