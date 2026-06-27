import type { SessionScope, StructuredAgentRuntime } from '@seta/core';
import { z } from 'zod';
import type { QaFinding, RoadmapResult, TrainingInitiative } from '../../types.ts';
import { TRAINING_QA_AGENT_ID } from '../agent-specs.ts';
import { QA_TOOL_IDS } from '../agent-tools.ts';
import { buildQaReviewResult } from './qa/qa-decision.ts';
import {
  assertQaScoreMatches,
  assertQaToolsCalled,
  createQaToolRun,
  deleteQaToolRun,
  getQaScoreCall,
  getQaToolResults,
  missingQaTools,
  recordQaFinalFindings,
} from './qa/qa-tool-context.ts';
import type { QaInput } from './qa/qa-validate-roadmap.ts';
import { qaValidateRoadmap } from './qa/qa-validate-roadmap.ts';
import { buildRequestScopeFindings } from './qa/request-scope.ts';
import type { RoadmapOutputAgent } from './qa/roadmap-output-loader.ts';

const qaFindingSchema = z.object({
  type: z.enum([
    'NO_TRAINEE_EVIDENCE',
    'UNSUPPORTED_INITIATIVE',
    'BOD_ALIGNMENT_RISK',
    'MISSING_PROJECT_REQUIREMENT',
    'TRAINER_NOT_FOUND',
    'TIMELINE_MISMATCH',
    'TRACEABILITY_GAP',
    'PROMPT_SCOPE_VIOLATION',
  ]),
  severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  message: z.string().min(1),
  skill: z.string().min(1).optional(),
  relatedInitiativeId: z.string().min(1).optional(),
  evidence: z.array(z.object({ path: z.string().min(1), value: z.string() })),
});

const qaAgentOutputSchema = z.object({
  findings: z.array(qaFindingSchema),
  semanticSummary: z.array(
    z.object({
      initiativeId: z.string().optional(),
      skill: z.string(),
      decision: z.enum(['ALIGNED', 'NOT_ALIGNED']),
      rationale: z.string(),
      evidenceIds: z.array(z.string()),
    }),
  ),
});

type QaAgentOutput = Omit<z.infer<typeof qaAgentOutputSchema>, 'findings'> & {
  findings: QaFinding[];
};

function mapFormat(
  format: RoadmapOutputAgent['initiatives'][number]['format'],
): TrainingInitiative['format'] {
  if (format === 'EXTERNAL_TRAINER') return 'external';
  if (format === 'ONLINE_COURSE' || format === 'GROUP_STUDY') return 'self-study';
  return 'internal';
}

export async function runTrainingRoadmapPipeline(args: {
  source: RoadmapOutputAgent;
  qaInput: QaInput;
  agents: StructuredAgentRuntime;
  abortSignal?: AbortSignal;
  session?: SessionScope;
}): Promise<RoadmapResult> {
  const toolRunId = createQaToolRun(args.qaInput);
  let reviewed: QaAgentOutput;
  let scored: ReturnType<typeof getQaScoreCall>;
  try {
    const checkToolIds = Object.values(QA_TOOL_IDS).filter(
      (toolId) => toolId !== QA_TOOL_IDS.score,
    );
    await args.agents.callTools({
      agentId: TRAINING_QA_AGENT_ID,
      prompt: [
        `QA tool runId: ${toolRunId}`,
        'Call each of these QA tools exactly once with that runId. Call all tools in parallel and do not call the score tool:',
        checkToolIds.join(', '),
      ].join('\n'),
      abortSignal: args.abortSignal,
      session: args.session,
    });
    for (const toolName of missingQaTools(toolRunId, checkToolIds)) {
      await args.agents.callTool({
        agentId: TRAINING_QA_AGENT_ID,
        toolName,
        prompt: `Call ${toolName} exactly once with runId ${toolRunId}. Do not call another tool.`,
        abortSignal: args.abortSignal,
        session: args.session,
      });
    }
    assertQaToolsCalled(toolRunId, checkToolIds);
    const toolResults = Object.fromEntries(getQaToolResults(toolRunId));

    reviewed = await args.agents.generate({
      agentId: TRAINING_QA_AGENT_ID,
      prompt: [
        'Synthesize the final QA findings from these completed tool results.',
        'Use semantic reasoning for BOD and project alignment. Remove exact-match alignment findings only when semanticContext proves alignment.',
        'Audit every initiative against the original user request, including topic, target cohort, proficiency, trainee count, and timeline.',
        'Preserve evidence from retained findings. Do not call any tool in this synthesis step.',
        JSON.stringify({
          request: args.qaInput.request ?? { userPrompt: '' },
          roadmapInitiatives: args.source.initiatives.map((initiative) => ({
            id: initiative.id,
            topic: initiative.topic,
            quarter: initiative.quarter,
            evidence: initiative.evidence.map((evidence) => evidence.recordId),
          })),
          traineeProfiles: (args.qaInput.normalizedData.employees ?? []).filter((employee) =>
            args.source.initiatives.some((initiative) =>
              initiative.targetTrainees.includes(employee.id),
            ),
          ),
          toolResults,
        }),
      ].join('\n'),
      schema: qaAgentOutputSchema,
      abortSignal: args.abortSignal,
      maxSteps: 1,
      session: args.session,
      toolChoice: 'none',
    });
    const existingScopeFindings = new Set(
      reviewed.findings
        .filter((finding) => finding.type === 'PROMPT_SCOPE_VIOLATION')
        .map((finding) => finding.relatedInitiativeId ?? finding.skill ?? 'request'),
    );
    const scopeFindings = buildRequestScopeFindings({
      userPrompt: args.qaInput.request?.userPrompt ?? '',
      initiatives: args.source.initiatives.map((initiative) => ({
        id: initiative.id,
        topic: initiative.topic,
      })),
      decisions: reviewed.semanticSummary,
    }).filter(
      (finding) =>
        !existingScopeFindings.has(finding.relatedInitiativeId ?? finding.skill ?? 'request'),
    );
    reviewed.findings.push(...scopeFindings);
    const deterministic = await qaValidateRoadmap(args.qaInput);
    const findingKeys = new Set(
      reviewed.findings.map(
        (finding) => `${finding.type}:${finding.relatedInitiativeId ?? ''}:${finding.skill ?? ''}`,
      ),
    );
    for (const finding of deterministic.findings) {
      const key = `${finding.type}:${finding.relatedInitiativeId ?? ''}:${finding.skill ?? ''}`;
      if (!findingKeys.has(key)) {
        reviewed.findings.push(finding);
        findingKeys.add(key);
      }
    }
    recordQaFinalFindings(toolRunId, reviewed.findings);
    await args.agents.callTool({
      agentId: TRAINING_QA_AGENT_ID,
      toolName: QA_TOOL_IDS.score,
      prompt: `Call ${QA_TOOL_IDS.score} exactly once with runId ${toolRunId}.`,
      abortSignal: args.abortSignal,
      session: args.session,
    });
    assertQaToolsCalled(toolRunId, Object.values(QA_TOOL_IDS));
    scored = getQaScoreCall(toolRunId);
    assertQaScoreMatches(toolRunId, {
      findings: reviewed.findings,
      score: scored.result.score,
      riskLevel: scored.result.riskLevel,
      riskReason: scored.result.reason,
    });
  } finally {
    deleteQaToolRun(toolRunId);
  }

  const qaReview = buildQaReviewResult({
    findings: reviewed.findings,
    score: scored.result.score,
    riskLevel: scored.result.riskLevel,
    initiatives: args.qaInput.roadmap?.items ?? [],
    revisionCount: args.source.revisionCount,
  });
  const reviewStatus = qaReview.qaDecision === 'BLOCKED' ? 'blocked' : 'pending_review';
  const gateLog =
    qaReview.qaDecision === 'PASS' || qaReview.qaDecision === 'PASS_WITH_WARNINGS'
      ? 'Paused at Human Review Gate.'
      : qaReview.qaDecision === 'REVISE_REQUIRED'
        ? 'Agent 2 returned revision instructions to Agent 1.'
        : 'Agent 2 blocked the roadmap from approval and export.';

  return {
    runId: args.source.runId,
    reviewStatus,
    executionLog: [
      ...args.source.executionLog.filter((entry) => entry !== 'Paused at Human Review Gate.'),
      'Loaded roadmap_output_agent.json.',
      'QA reviewer audited the Agent 1 draft against normalized data.',
      gateLog,
    ],
    initiatives: args.source.initiatives.map((initiative) => ({
      id: initiative.id,
      topic: initiative.topic,
      priority: initiative.priority,
      score: initiative.score,
      quarter: initiative.quarter,
      targetTrainees: initiative.targetTrainees,
      trainerName: initiative.trainerName,
      objective: initiative.objective,
      prerequisites: initiative.prerequisites,
      format: mapFormat(initiative.format),
      formatExplanation: initiative.formatExplanation,
      evaluationCriteria: initiative.evaluationCriteria,
      durationWeeks: initiative.durationWeeks,
      timeline: initiative.timeline,
      estimatedHours: initiative.estimatedHours,
      evidence: initiative.evidence,
      alignmentType: initiative.alignmentType,
      approvalRequired: initiative.approvalRequired,
      alignmentNote: initiative.alignmentNote,
      riskFlags: reviewed.findings.filter(
        (finding) => finding.relatedInitiativeId === initiative.id,
      ),
      ...(initiative.fallbackReason ? { fallbackReason: initiative.fallbackReason } : {}),
      ...(initiative.fallbackPlan ? { fallbackPlan: initiative.fallbackPlan } : {}),
    })),
    qaFindings: reviewed.findings,
    qaDecision: qaReview.qaDecision,
    blockingIssues: qaReview.blockingIssues,
    revisionInstructions: qaReview.revisionInstructions,
    approvalRequirement: qaReview.approvalRequirement,
    qaSummary: qaReview.summary,
    qaScore: scored.result.score,
    riskLevel: scored.result.riskLevel,
    riskReason: scored.result.reason,
    revisionCount: args.source.revisionCount,
    coverageResult: 'coverageResult' in args.source ? args.source.coverageResult : undefined,
    evidencePack: {
      revisionHistory: args.source.revisionHistory,
      semanticSummary: reviewed.semanticSummary,
      findings: reviewed.findings.map((finding) => ({
        type: finding.type,
        relatedInitiativeId: finding.relatedInitiativeId,
        evidence: finding.evidence,
      })),
    },
    reviewPack: {
      request: args.qaInput.request ?? { userPrompt: '' },
      generatedAt: new Date().toISOString(),
      initiativeCount: args.source.initiatives.length,
      semanticSummary: reviewed.semanticSummary,
      findings: reviewed.findings,
    },
  };
}
