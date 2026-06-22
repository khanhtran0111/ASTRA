import { writeFileSync } from 'node:fs';
import { defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';
import type { RoadmapResult } from '../../types.ts';
import {
  auditDataDrivenRoadmap,
  defaultTrainingDataDir,
  runDataDrivenCoordinator,
} from '../domain/data-driven-pipeline.ts';
import { buildExportProposal } from '../domain/export-proposal.ts';
import { getRunScratchPath, readJsonFileOrDefault } from '../scratch-storage.ts';

export const DATA_FIRST_TOOL_IDS = {
  ingest: 'trainingRoadmap_ingestAllSourcesTool',
  evidence: 'trainingRoadmap_buildEvidenceIndexTool',
  ontology: 'trainingRoadmap_buildSkillOntologyTool',
  candidates: 'trainingRoadmap_generateTrainingCandidatesTool',
  trainees: 'trainingRoadmap_allocateTraineesTool',
  trainers: 'trainingRoadmap_matchTrainersTool',
  learningPlan: 'trainingRoadmap_estimateLearningPlanTool',
  priorities: 'trainingRoadmap_scorePrioritiesTool',
  roadmap: 'trainingRoadmap_generateRoadmapTool',
  qa: 'trainingRoadmap_qaValidateRoadmapTool',
  approve: 'trainingRoadmap_approveRoadmapTool',
  export: 'trainingRoadmap_exportProposalTool',
} as const;

const coordinatorInput = z.object({ userPrompt: z.string().default('') });

let cachedSnapshot:
  | { key: string; createdAt: number; result: ReturnType<typeof runDataDrivenCoordinator> }
  | undefined;

function snapshot(userPrompt: string) {
  const dataDir = defaultTrainingDataDir();
  const key = `${dataDir}\u0000${userPrompt}`;
  if (cachedSnapshot?.key === key && Date.now() - cachedSnapshot.createdAt < 30_000) {
    return cachedSnapshot.result;
  }
  const result = runDataDrivenCoordinator({
    dataDir,
    runId: `tool-${Date.now()}`,
    userPrompt,
  });
  cachedSnapshot = { key, createdAt: Date.now(), result };
  return result;
}

const inventorySchema = z.object({
  sources: z.array(
    z.object({
      sourceId: z.enum(['DS01', 'DS02', 'DS03', 'DS04', 'DS05', 'MARKET']),
      fileName: z.string(),
      rowCount: z.number(),
      validRows: z.number(),
      invalidRows: z.number(),
      skippedRows: z.number(),
      detectedColumns: z.array(z.string()),
      warnings: z.array(z.string()),
    }),
  ),
});

const ingestAllSourcesTool = defineAgentTool({
  id: DATA_FIRST_TOOL_IDS.ingest,
  name: 'Ingest all training data sources',
  description: 'Scan DS01-DS05 and optional market data, returning row-level inventory coverage.',
  input: coordinatorInput,
  output: inventorySchema,
  rbac: 'training-roadmap:read',
  execute: async ({ userPrompt }) => ({ sources: snapshot(userPrompt).inventory }),
});

const buildEvidenceIndexTool = defineAgentTool({
  id: DATA_FIRST_TOOL_IDS.evidence,
  name: 'Build training evidence index',
  description:
    'Normalize every valid source row into traceable evidence before candidate reasoning.',
  input: coordinatorInput,
  output: z.object({
    evidence: z.array(
      z.object({
        id: z.string(),
        sourceId: z.enum(['DS01', 'DS02', 'DS03', 'DS04', 'DS05', 'MARKET']),
        rowId: z.string(),
        entityType: z.string(),
        normalizedText: z.string(),
        extractedSkills: z.array(z.string()),
        confidence: z.number(),
      }),
    ),
  }),
  rbac: 'training-roadmap:read',
  execute: async ({ userPrompt }) => ({
    evidence: snapshot(userPrompt).evidenceIndex.map((item) => ({
      id: item.id,
      sourceId: item.sourceId,
      rowId: item.rowId,
      entityType: item.entityType,
      normalizedText: item.normalizedText,
      extractedSkills: item.extractedSkills,
      confidence: item.confidence,
    })),
  }),
});

const buildSkillOntologyTool = defineAgentTool({
  id: DATA_FIRST_TOOL_IDS.ontology,
  name: 'Build dynamic skill ontology',
  description:
    'Discover canonical skills and aliases from all ingested sources without a fixed topic list.',
  input: coordinatorInput,
  output: z.object({
    skills: z.array(
      z.object({
        id: z.string(),
        displayName: z.string(),
        aliases: z.array(z.string()),
        sourceCoverage: z.array(z.string()),
      }),
    ),
  }),
  rbac: 'training-roadmap:read',
  execute: async ({ userPrompt }) => ({ skills: snapshot(userPrompt).ontology }),
});

const generateTrainingCandidatesTool = defineAgentTool({
  id: DATA_FIRST_TOOL_IDS.candidates,
  name: 'Generate demand-backed training candidates',
  description:
    'Generate candidates from employee, project, survey, BOD, and relevant market demand.',
  input: coordinatorInput,
  output: z.object({
    candidates: z.array(
      z.object({
        canonicalSkillId: z.string(),
        topic: z.string(),
        employeeGap: z.boolean(),
        projectNeed: z.boolean(),
        surveyNeed: z.boolean(),
        bodAlignment: z.boolean(),
        trainerCandidate: z.boolean(),
        marketSignal: z.boolean(),
      }),
    ),
    dropped: z.array(z.object({ candidate: z.string(), reason: z.string() })),
  }),
  rbac: 'training-roadmap:read',
  execute: async ({ userPrompt }) => {
    const result = snapshot(userPrompt);
    return {
      candidates: result.candidates.map((candidate) => ({
        canonicalSkillId: candidate.canonicalSkillId,
        topic: candidate.topic,
        employeeGap: candidate.sourceCoverage.hasEmployeeGap,
        projectNeed: candidate.sourceCoverage.hasProjectNeed,
        surveyNeed: candidate.sourceCoverage.hasSurveyNeed,
        bodAlignment: candidate.sourceCoverage.hasBodAlignment,
        trainerCandidate: candidate.sourceCoverage.hasTrainerCandidate,
        marketSignal: candidate.sourceCoverage.hasMarketSignal,
      })),
      dropped: result.unselectedCandidates.map((item) => ({
        candidate: item.candidate,
        reason: item.reasonDropped,
      })),
    };
  },
});

const allocatedRoadmapSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      topic: z.string(),
      trainees: z.array(
        z.object({
          employeeId: z.string(),
          role: z.string().optional(),
          matchedGap: z.string(),
          reason: z.string(),
        }),
      ),
    }),
  ),
});

const allocateTraineesTool = defineAgentTool({
  id: DATA_FIRST_TOOL_IDS.trainees,
  name: 'Allocate DS01-backed trainees',
  description: 'Scan every DS01 employee and retain only direct normalized gap matches.',
  input: coordinatorInput,
  output: allocatedRoadmapSchema,
  rbac: 'training-roadmap:read',
  execute: async ({ userPrompt }) => ({
    items: snapshot(userPrompt).roadmap.initiatives.map((item) => ({
      id: item.id,
      topic: item.topic,
      trainees: item.trainees.map((trainee) => ({
        employeeId: trainee.employeeId,
        role: trainee.role,
        matchedGap: trainee.matchedGap,
        reason: trainee.reason,
      })),
    })),
  }),
});

const matchTrainersTool = defineAgentTool({
  id: DATA_FIRST_TOOL_IDS.trainers,
  name: 'Rank internal trainer candidates',
  description:
    'Scan every DS04 trainer using canonical, alias, fuzzy, and contact-hour capacity fit.',
  input: coordinatorInput,
  output: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        topic: z.string(),
        selectedTrainer: z.string().nullable(),
        format: z.string(),
        fallbackReason: z.string().optional(),
        candidates: z.array(
          z.object({
            trainerId: z.string(),
            fitScore: z.number(),
            matchedSkills: z.array(z.string()),
            capacityStatus: z.enum(['FULL', 'PARTIAL', 'NONE']),
          }),
        ),
      }),
    ),
  }),
  rbac: 'training-roadmap:read',
  execute: async ({ userPrompt }) => ({
    items: snapshot(userPrompt).roadmap.initiatives.map((item) => ({
      id: item.id,
      topic: item.topic,
      selectedTrainer: item.selectedTrainer,
      format: item.format,
      fallbackReason: item.fallbackReason,
      candidates: item.trainerCandidates.map((trainer) => ({
        trainerId: trainer.trainerId,
        fitScore: trainer.fitScore,
        matchedSkills: trainer.matchedSkills,
        capacityStatus: trainer.capacityStatus,
      })),
    })),
  }),
});

const estimateLearningPlanTool = defineAgentTool({
  id: DATA_FIRST_TOOL_IDS.learningPlan,
  name: 'Estimate learning plan hours',
  description: 'Separate total, trainer contact, self-study, lab hours, and duration.',
  input: coordinatorInput,
  output: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        totalHours: z.number(),
        trainerContactHours: z.number(),
        selfStudyHours: z.number(),
        labHours: z.number(),
        durationWeeks: z.number(),
      }),
    ),
  }),
  rbac: 'training-roadmap:read',
  execute: async ({ userPrompt }) => ({
    items: snapshot(userPrompt).roadmap.initiatives.map((item) => ({
      id: item.id,
      totalHours: item.totalHours,
      trainerContactHours: item.trainerContactHours,
      selfStudyHours: item.selfStudyHours,
      labHours: item.labHours,
      durationWeeks: item.weeks.durationWeeks,
    })),
  }),
});

const scorePrioritiesTool = defineAgentTool({
  id: DATA_FIRST_TOOL_IDS.priorities,
  name: 'Score roadmap priorities',
  description:
    'Calculate weighted BOD, project, employee, survey, feasibility, market, and risk scores.',
  input: coordinatorInput,
  output: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        topic: z.string(),
        priority: z.enum(['P1', 'P2', 'P3']),
        score: z.number(),
        breakdown: z.array(z.object({ component: z.string(), value: z.number() })),
      }),
    ),
  }),
  rbac: 'training-roadmap:read',
  execute: async ({ userPrompt }) => ({
    items: snapshot(userPrompt).roadmap.initiatives.map((item) => ({
      id: item.id,
      topic: item.topic,
      priority: item.priority,
      score: item.score,
      breakdown: Object.entries(item.scoreBreakdown).map(([component, value]) => ({
        component,
        value,
      })),
    })),
  }),
});

const generateRoadmapTool = defineAgentTool({
  id: DATA_FIRST_TOOL_IDS.roadmap,
  name: 'Generate evidence-backed roadmap',
  description:
    'Return only selected items with trainees, evidence, trainer decisions, plans, and scores.',
  input: coordinatorInput,
  output: z.object({
    selectedCount: z.number(),
    droppedCount: z.number(),
    items: z.array(
      z.object({
        id: z.string(),
        topic: z.string(),
        priority: z.enum(['P1', 'P2', 'P3']),
        score: z.number(),
        traineeCount: z.number(),
        evidenceCount: z.number(),
        format: z.string(),
      }),
    ),
  }),
  rbac: 'training-roadmap:read',
  execute: async ({ userPrompt }) => {
    const result = snapshot(userPrompt);
    return {
      selectedCount: result.coverageReport.selectedCount,
      droppedCount: result.coverageReport.droppedCount,
      items: result.roadmap.initiatives.map((item) => ({
        id: item.id,
        topic: item.topic,
        priority: item.priority,
        score: item.score,
        traineeCount: item.trainees.length,
        evidenceCount: item.evidenceRefs.length,
        format: item.format,
      })),
    };
  },
});

const qaValidateRoadmapTool = defineAgentTool({
  id: DATA_FIRST_TOOL_IDS.qa,
  name: 'Validate DATA-FIRST roadmap coverage',
  description:
    'Audit inventory coverage, DS01 trainees, evidence, score breakdowns, and fallbacks.',
  input: coordinatorInput,
  output: z.object({
    findings: z.array(
      z.object({
        issueCode: z.string(),
        affectedItemId: z.string(),
        blockingLevel: z.enum(['HIGH', 'MEDIUM', 'LOW']),
        message: z.string(),
      }),
    ),
    revisionActions: z.array(
      z.object({
        issueCode: z.string(),
        affectedItemId: z.string(),
        blockingLevel: z.enum(['HIGH', 'MEDIUM', 'LOW']),
        requiredToolToRerun: z.string(),
        expectedFix: z.string(),
      }),
    ),
  }),
  rbac: 'training-roadmap:read',
  execute: async ({ userPrompt }) => {
    const result = snapshot(userPrompt);
    return auditDataDrivenRoadmap({
      inventory: result.inventory,
      coverageReport: result.coverageReport,
      initiatives: result.roadmap.initiatives,
    });
  },
});

const approveRoadmapTool = defineAgentTool({
  id: DATA_FIRST_TOOL_IDS.approve,
  name: 'Approve training roadmap',
  description: 'Record human approval only after QA PASS or PASS_WITH_WARNINGS.',
  input: z.object({
    runId: z.string().min(1),
    decision: z.enum(['approved', 'approved_with_risks']),
    approvalNote: z.string().optional(),
  }),
  output: z.object({ runId: z.string(), approvalToken: z.string(), reviewStatus: z.string() }),
  needsApproval: true,
  rbac: 'training-roadmap:write',
  execute: async ({ runId, decision, approvalNote }) => {
    const path = getRunScratchPath(runId, 'qa_result.json');
    const result = readJsonFileOrDefault(path, null) as RoadmapResult | null;
    if (!result) throw new Error('QA run not found');
    if (result.qaDecision === 'PASS_WITH_WARNINGS' && decision !== 'approved_with_risks') {
      throw new Error('PASS_WITH_WARNINGS requires approved_with_risks');
    }
    if (result.qaDecision !== 'PASS' && result.qaDecision !== 'PASS_WITH_WARNINGS') {
      throw new Error(`Roadmap cannot be approved when QA decision is ${result.qaDecision}`);
    }
    if (decision === 'approved_with_risks' && !approvalNote?.trim()) {
      throw new Error('Approval note is required for approved_with_risks');
    }
    const approvalToken = `APPROVAL-${runId}-${Date.now()}`;
    writeFileSync(
      path,
      JSON.stringify(
        { ...result, reviewStatus: decision, approvalToken, approvalNotes: approvalNote?.trim() },
        null,
        2,
      ),
    );
    return { runId, approvalToken, reviewStatus: decision };
  },
});

const exportProposalTool = defineAgentTool({
  id: DATA_FIRST_TOOL_IDS.export,
  name: 'Export approved roadmap proposal',
  description: 'Build an export proposal only when a valid approval token is already recorded.',
  input: z.object({ runId: z.string().min(1) }),
  output: z.object({ runId: z.string(), proposalJson: z.string() }),
  rbac: 'training-roadmap:read',
  execute: async ({ runId }) => {
    const result = readJsonFileOrDefault(
      getRunScratchPath(runId, 'qa_result.json'),
      null,
    ) as RoadmapResult | null;
    if (!result) throw new Error('QA run not found');
    return { runId, proposalJson: JSON.stringify(buildExportProposal(result)) };
  },
});

export const dataDrivenTrainingRoadmapTools = [
  ingestAllSourcesTool,
  buildEvidenceIndexTool,
  buildSkillOntologyTool,
  generateTrainingCandidatesTool,
  allocateTraineesTool,
  matchTrainersTool,
  estimateLearningPlanTool,
  scorePrioritiesTool,
  generateRoadmapTool,
  qaValidateRoadmapTool,
  approveRoadmapTool,
  exportProposalTool,
];
