import type { SessionScope, StructuredAgentRuntime } from '@seta/core';
import { z } from 'zod';
import type { RoadmapResult, TrainingInitiative } from '../../types.ts';
import { TRAINING_QA_AGENT_ID } from '../agent-specs.ts';
import { QA_TOOL_IDS } from '../agent-tools.ts';
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
import { buildRequestScopeFindings } from './qa/request-scope.ts';
import type { RoadmapOutputAgent } from './qa/roadmap-output-loader.ts';

const qaFindingSchema = z.object({
  type: z.enum([
    'INVALID_TRAINEE',
    'TRAINER_GAP',
    'MISSING_EVIDENCE',
    'BOD_ALIGNMENT_RISK',
    'MISSING_PROJECT_REQUIREMENT',
    'TRAINEE_MISMATCH',
    'TIMELINE_RISK',
    'TRACEABILITY_GAP',
    'REQUEST_SCOPE_MISMATCH',
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
  let reviewed: z.infer<typeof qaAgentOutputSchema>;
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
            evidence: initiative.evidence,
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
        .filter((finding) => finding.type === 'REQUEST_SCOPE_MISMATCH')
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

  return {
    runId: args.source.runId,
    reviewStatus: 'pending',
    executionLog: [
      ...args.source.executionLog.filter((entry) => entry !== 'Paused at Human Review Gate.'),
      'Loaded roadmap_output_agent.json.',
      'QA reviewer audited the Agent 1 draft against normalized data.',
      'Paused at Human Review Gate.',
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
      riskFlags: reviewed.findings.filter(
        (finding) => finding.relatedInitiativeId === initiative.id,
      ),
      ...(initiative.fallbackReason ? { fallbackReason: initiative.fallbackReason } : {}),
    })),
    qaFindings: reviewed.findings,
    qaScore: scored.result.score,
    riskLevel: scored.result.riskLevel,
    riskReason: scored.result.reason,
    evidencePack: {
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
