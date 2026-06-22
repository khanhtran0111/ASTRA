import fs from 'node:fs';
import type { SessionEnv, StructuredAgentRuntime } from '@seta/core';
import type { Context } from 'hono';
import { Hono } from 'hono';
import type {
  ApprovalDecision,
  ApprovalResponse,
  EvidenceRef,
  RoadmapResult,
} from '../../types.ts';
import {
  defaultTrainingDataDir,
  type IndexedEvidenceRef,
  runDataDrivenCoordinator,
} from '../domain/data-driven-pipeline.ts';
import { buildExportProposal } from '../domain/export-proposal.ts';
import { generateFallbackPlan } from '../domain/fallback-plan.ts';
import { runTrainingRoadmapPipeline } from '../domain/pipeline.ts';
import type { RoadmapOutputAgent } from '../domain/qa/roadmap-output-loader.ts';
import { loadQaInputFromRoadmapOutput } from '../domain/qa/roadmap-output-loader.ts';
import { reviseRoadmap } from '../domain/revise-roadmap.ts';
import {
  getActiveRunScratchPath,
  getRunScratchPath,
  readJsonFileOrDefault,
  withTrainingRoadmapRun,
} from '../scratch-storage.ts';

function isApprovalDecision(value: unknown): value is ApprovalDecision {
  return (
    value === 'approved' ||
    value === 'approved_with_risks' ||
    value === 'revision_requested' ||
    value === 'rejected'
  );
}

async function readJsonBody(c: Context) {
  try {
    return (await c.req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function createRunId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}`;
}

function toLegacyEvidence(refs: IndexedEvidenceRef[]): EvidenceRef[] {
  return refs.flatMap((ref) =>
    ref.sourceId === 'MARKET'
      ? []
      : [
          {
            source: ref.sourceId,
            recordId: ref.rowId,
            field: ref.field,
            value: ref.value,
            reason: ref.reason,
          },
        ],
  );
}

async function runCoordinator(userPrompt: string): Promise<{
  source: RoadmapOutputAgent;
  agentReasoning: string;
  draftRoadmap: unknown;
}> {
  const runId = createRunId();

  return withTrainingRoadmapRun(runId, async () => {
    const result = runDataDrivenCoordinator({
      dataDir: defaultTrainingDataDir(),
      runId,
      userPrompt,
    });
    const source: RoadmapOutputAgent = {
      runId,
      request: { userPrompt },
      executionLog: [
        ...result.toolTrace.map((entry) => `${entry.tool}: ${entry.detail}`),
        `Coverage report: ${result.coverageReport.selectedCount} selected, ${result.coverageReport.droppedCount} dropped.`,
        'Generated evidence-backed draft roadmap.',
        'Paused at Human Review Gate.',
      ],
      revisionCount: 0,
      revisionHistory: [],
      initiatives: result.roadmap.initiatives.map((item) => {
        const evidence = toLegacyEvidence(item.evidenceRefs);
        const format =
          item.format === 'INTERNAL_TRAINING'
            ? ('INTERNAL_TRAINING' as const)
            : item.format === 'EXTERNAL_TRAINER'
              ? ('EXTERNAL_TRAINER' as const)
              : ('GROUP_STUDY' as const);
        return {
          id: item.id,
          topic: item.topic,
          canonicalSkillId: item.canonicalSkillId,
          priority: item.priority,
          score: item.score,
          quarter: item.quarter,
          targetTrainees: item.trainees.map((trainee) => trainee.employeeId),
          traineeDetails: item.trainees.map((trainee) => ({
            employeeId: trainee.employeeId,
            employeeName: trainee.employeeName,
            position: trainee.role ?? 'Unknown role',
            team: trainee.team,
            proficiencyLevel: trainee.proficiency ?? 'Unknown',
            matchedSkillGap: [trainee.matchedGap],
            evidenceRefs: toLegacyEvidence(trainee.evidenceRefs),
            reason: trainee.reason,
          })),
          trainerName: item.selectedTrainer,
          selectedTrainer: item.selectedTrainer,
          trainerCandidates: item.trainerCandidates.map((trainer) => ({
            ...trainer,
            evidenceRefs: toLegacyEvidence(trainer.evidenceRefs),
          })),
          objective: item.objectives.join(' '),
          prerequisites: item.prerequisites,
          format,
          deliveryFormat: item.format,
          formatExplanation: item.trainerDecision,
          evaluationCriteria: item.evaluationCriteria,
          durationWeeks: item.weeks.durationWeeks,
          timeline: {
            startWeek: item.weeks.startWeek,
            endWeek: item.weeks.endWeek,
          },
          estimatedHours: item.totalHours,
          totalHours: item.totalHours,
          trainerContactHours: item.trainerContactHours,
          selfStudyHours: item.selfStudyHours,
          labHours: item.labHours,
          evidence,
          scoreBreakdown: item.scoreBreakdown,
          selectionReason: item.selectionReason,
          risks: item.risks,
          requiresHumanApproval: item.requiresHumanApproval,
          ...(evidence.some((ref) => ref.source === 'DS02')
            ? { alignmentType: 'PROJECT_BACKED' as const }
            : {}),
          ...(item.fallbackReason ? { fallbackReason: item.fallbackReason } : {}),
          ...(item.format === 'EXTERNAL_TRAINER'
            ? {
                fallbackPlan: generateFallbackPlan({
                  skillName: item.topic,
                  fallbackReason: 'TRAINER_NOT_FOUND',
                  estimatedHours: item.totalHours,
                  traineeCount: item.trainees.length,
                }),
              }
            : {}),
        };
      }),
      dataInventory: result.inventory,
      dataCoverageReport: result.coverageReport,
      unselectedCandidates: result.unselectedCandidates.map((candidate) => ({
        ...candidate,
        evidenceRefs: toLegacyEvidence(candidate.evidenceRefs),
      })),
      toolTrace: result.toolTrace,
      coverageResult: result.coverageReport.coverageResult,
    };
    const agentReasoning = [
      'Agent 1 used deterministic source ingestion, evidence indexing, dynamic ontology, allocation, trainer matching, learning-plan estimation, and scoring.',
      `No LLM-created topic was accepted. ${result.candidates.length} evidence-backed candidates were evaluated.`,
    ].join(' ');
    const draftRoadmap = result.roadmap;

    for (const [fileName, artifact] of [
      ['data_inventory.json', result.inventory],
      ['evidence_index.json', result.evidenceIndex],
      ['skill_ontology.json', result.ontology],
      ['training_candidates.json', result.candidates],
      ['unselected_candidates.json', result.unselectedCandidates],
      ['coverage_report.json', result.coverageReport],
      ['tool_trace.json', result.toolTrace],
    ] as const) {
      fs.writeFileSync(getActiveRunScratchPath(fileName), JSON.stringify(artifact, null, 2));
    }

    fs.writeFileSync(
      getActiveRunScratchPath('roadmap_output_agent.json'),
      JSON.stringify({ ...source, agentReasoning, draftRoadmap }, null, 2),
    );

    return { source, agentReasoning, draftRoadmap };
  });
}

export function buildTrainingRoadmapRouteHandlers(deps: {
  agents: StructuredAgentRuntime;
}): Hono<SessionEnv> {
  const routes = new Hono<SessionEnv>();

  routes.get('/health', (c) => c.json({ ok: true, module: 'training-roadmap' }));

  routes.post('/run', async (c) => {
    const body = await readJsonBody(c);
    const userPrompt = typeof body.userPrompt === 'string' ? body.userPrompt : '';

    try {
      const result = await runCoordinator(userPrompt);

      return c.json({
        ...result.source,
        agentReasoning: result.agentReasoning,
        draftRoadmap: result.draftRoadmap,
      });
    } catch (error) {
      console.error('Coordinator agent execution error', error);

      if (
        error instanceof Error &&
        (error.message.startsWith('Coordinator returned no valid scope-aligned skills') ||
          error.message.startsWith('Coordinator produced no evidence-backed') ||
          error.message.startsWith('Coordinator trainer matching did not use'))
      ) {
        return c.json({ error: error.message }, 422);
      }

      return c.json({ error: String(error) }, 500);
    }
  });

  routes.post('/qa', async (c) => {
    const body = await readJsonBody(c);

    if (typeof body.runId !== 'string' || body.runId.trim().length === 0) {
      return c.json({ error: 'runId is required' }, 400);
    }

    try {
      let { source, qaInput } = await loadQaInputFromRoadmapOutput(body.runId);
      let result: RoadmapResult;

      while (true) {
        result = await runTrainingRoadmapPipeline({
          source,
          qaInput,
          agents: deps.agents,
          abortSignal: c.req.raw.signal,
          session: c.get('user'),
        });

        if (result.qaDecision !== 'REVISE_REQUIRED' || source.revisionCount >= 2) break;

        source = reviseRoadmap(source, result.revisionInstructions);

        fs.writeFileSync(
          getRunScratchPath(source.runId, 'roadmap_output_agent.json'),
          JSON.stringify(source, null, 2),
        );

        ({ source, qaInput } = await loadQaInputFromRoadmapOutput(body.runId));
      }

      fs.writeFileSync(
        getRunScratchPath(result.runId, 'qa_result.json'),
        JSON.stringify(result, null, 2),
      );

      return c.json(result);
    } catch (error) {
      console.error('QA agent execution error', error);

      if (error instanceof Error && error.message.startsWith('Agent 1 artifact belongs to run ')) {
        return c.json({ error: error.message }, 409);
      }

      if (error instanceof Error && error.message.startsWith('QA input file not found.')) {
        return c.json({ error: 'Agent 1 run not found' }, 404);
      }

      return c.json({ error: String(error) }, 500);
    }
  });

  routes.post('/approve', async (c) => {
    const body = await readJsonBody(c);

    if (typeof body.runId !== 'string' || body.runId.trim().length === 0) {
      return c.json({ error: 'runId is required' }, 400);
    }

    if (!isApprovalDecision(body.decision)) {
      return c.json({ error: 'Invalid decision' }, 400);
    }

    const qaResultPath = getRunScratchPath(body.runId, 'qa_result.json');
    const qaResult = readJsonFileOrDefault(qaResultPath, null);

    if (!qaResult || typeof qaResult !== 'object') {
      return c.json({ error: 'QA run not found' }, 404);
    }

    if (!('reviewPack' in qaResult)) {
      return c.json({ error: 'Review Pack is required before approval' }, 409);
    }

    if (!('runId' in qaResult) || qaResult.runId !== body.runId) {
      return c.json({ error: 'QA runId does not match the approval request' }, 409);
    }

    if (!('reviewStatus' in qaResult) || !('qaDecision' in qaResult)) {
      return c.json({ error: 'QA result is missing decision state' }, 409);
    }

    if (qaResult.reviewStatus !== 'pending_review' && qaResult.reviewStatus !== 'blocked') {
      return c.json({ error: 'QA run is no longer pending review' }, 409);
    }

    const allowedDecisions =
      qaResult.qaDecision === 'PASS'
        ? new Set<ApprovalDecision>(['approved', 'revision_requested', 'rejected'])
        : qaResult.qaDecision === 'PASS_WITH_WARNINGS'
          ? new Set<ApprovalDecision>(['approved_with_risks', 'revision_requested', 'rejected'])
          : qaResult.qaDecision === 'REVISE_REQUIRED'
            ? new Set<ApprovalDecision>(['revision_requested'])
            : new Set<ApprovalDecision>(['revision_requested', 'rejected']);

    if (!allowedDecisions.has(body.decision)) {
      return c.json(
        { error: `${body.decision} is not allowed when QA decision is ${qaResult.qaDecision}` },
        409,
      );
    }

    const approvalNotes = typeof body.approvalNote === 'string' ? body.approvalNote.trim() : '';

    if (body.decision === 'approved_with_risks' && !approvalNotes) {
      return c.json({ error: 'Approval note is required for approve-with-risks' }, 400);
    }

    const approvalToken =
      body.decision === 'approved' || body.decision === 'approved_with_risks'
        ? `APPROVAL-${body.runId}-${Date.now()}`
        : null;

    const approvedAt = approvalToken ? new Date().toISOString() : undefined;
    const approvedBy = approvalToken ? c.get('user')?.user_id : undefined;

    const response: ApprovalResponse = {
      runId: body.runId,
      reviewStatus: body.decision,
      approvalToken,
      ...(approvalNotes ? { approvalNotes } : {}),
      ...(approvedBy ? { approvedBy } : {}),
      ...(approvedAt ? { approvedAt } : {}),
    };

    fs.writeFileSync(qaResultPath, JSON.stringify({ ...qaResult, ...response }, null, 2));

    return c.json(response);
  });

  routes.post('/export', async (c) => {
    const body = await readJsonBody(c);

    if (typeof body.runId !== 'string' || body.runId.trim().length === 0) {
      return c.json({ error: 'runId is required' }, 400);
    }

    const qaResult = readJsonFileOrDefault(getRunScratchPath(body.runId, 'qa_result.json'), null);

    if (!qaResult || typeof qaResult !== 'object') {
      return c.json({ error: 'QA run not found' }, 404);
    }

    try {
      return c.json(buildExportProposal(qaResult as RoadmapResult));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 409);
    }
  });

  return routes;
}
