import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { StructuredAgentRuntime } from '@seta/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { QA_TOOL_IDS } from '../../src/backend/agent-tools.ts';
import { calculateQaScore } from '../../src/backend/domain/qa/qa-score.ts';
import {
  getQaFinalFindings,
  markQaToolCalled,
  recordQaScoreCall,
} from '../../src/backend/domain/qa/qa-tool-context.ts';
import { buildTrainingRoadmapRoutes } from '../../src/backend/http/index.ts';
import { getScratchPath, readJsonFileOrDefault } from '../../src/backend/scratch-storage.ts';

const fixturesDir = fileURLToPath(new URL('../helpers/fixtures', import.meta.url));
const dataFirstFixturesDir = fileURLToPath(
  new URL('../helpers/data-first-fixtures', import.meta.url),
);
const roadmapFixture = fileURLToPath(
  new URL('../helpers/fixtures/roadmap_output_agent.json', import.meta.url),
);
const missingProjectFixture = fileURLToPath(
  new URL('../helpers/fixtures/roadmap_missing_project.json', import.meta.url),
);

beforeAll(() => {
  vi.stubEnv('TRAINING_ROADMAP_OUTPUT_FILE', roadmapFixture);
  vi.stubEnv('TRAINING_ROADMAP_DATA_DIR', fixturesDir);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const calls: string[] = [];
const toolCalls: string[] = [];
const generatedPrompts: string[] = [];
const agents: StructuredAgentRuntime = {
  async generate<T>({
    agentId,
    prompt,
    schema,
  }: {
    agentId: string;
    prompt: string;
    schema: z.ZodType<T>;
  }): Promise<T> {
    calls.push(agentId);
    generatedPrompts.push(prompt);
    if (!agentId.endsWith('qa-reviewer')) throw new Error(`Unexpected agent: ${agentId}`);
    const payload = JSON.parse(prompt.split('\n').at(-1) ?? '{}') as {
      roadmapInitiatives?: Array<{ id: string; topic: string; evidence: string[] }>;
    };
    return schema.parse({
      findings: [],
      semanticSummary: (payload.roadmapInitiatives ?? []).map((initiative) => ({
        initiativeId: initiative.id,
        skill: initiative.topic,
        decision: 'ALIGNED',
        rationale: 'The fixture request intentionally covers the supplied engineering roadmap.',
        evidenceIds: initiative.evidence,
      })),
    });
  },
  async callTool({ toolName, prompt }) {
    toolCalls.push(toolName);
    const runId = /runId ([\w-]+)/.exec(prompt)?.[1];
    if (!runId) throw new Error('QA runId missing from tool prompt');
    markQaToolCalled(runId, toolName);
    if (toolName === QA_TOOL_IDS.score) {
      const findings = getQaFinalFindings(runId);
      recordQaScoreCall(runId, findings, calculateQaScore(findings));
    }
  },
  async callTools({ prompt }) {
    const runId = /QA tool runId: ([\w-]+)/.exec(prompt)?.[1];
    if (!runId) throw new Error('QA runId missing from tools prompt');
    for (const toolName of Object.values(QA_TOOL_IDS).filter(
      (toolId) => toolId !== QA_TOOL_IDS.score,
    )) {
      toolCalls.push(toolName);
      markQaToolCalled(runId, toolName);
    }
  },
};

const app = buildTrainingRoadmapRoutes({ agents } as never);

describe('training roadmap routes', () => {
  it('reports health', async () => {
    const res = await app.request('/api/training-roadmap/health');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, module: 'training-roadmap' });
  });

  it('runs data-first generation and QA through one canonical endpoint', async () => {
    calls.length = 0;
    toolCalls.length = 0;
    generatedPrompts.length = 0;
    vi.stubEnv('TRAINING_ROADMAP_DATA_DIR', dataFirstFixturesDir);

    const res = await app.request('/api/training-roadmap/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userPrompt: 'Create one Q3/2026 Security Testing initiative for Software Engineer.',
      }),
    });
    const body = await res.json();

    try {
      expect(res.status).toBe(200);
      expect(body).toMatchObject({
        reviewStatus: expect.stringMatching(/pending_review|blocked/),
        initiatives: [
          expect.objectContaining({
            topic: 'Security Testing',
            targetTrainees: ['EMP-001'],
          }),
        ],
        draftInitiatives: [
          expect.objectContaining({
            topic: 'Security Testing',
            targetTrainees: ['EMP-001'],
          }),
        ],
        draftRoadmap: {
          status: 'DRAFT',
          quarters: {
            Q3_2026: [expect.objectContaining({ topic: 'Security Testing' })],
          },
        },
        reviewPack: {
          request: {
            userPrompt: 'Create one Q3/2026 Security Testing initiative for Software Engineer.',
          },
        },
      });
      expect(body).toHaveProperty('qaDecision');
      expect(toolCalls).toEqual(Object.values(QA_TOOL_IDS));
      expect(
        await import('node:fs/promises').then(({ access }) =>
          Promise.all([
            access(
              getScratchPath('training-roadmap-runs', body.runId, 'roadmap_output_agent.json'),
            ),
            access(getScratchPath('training-roadmap-runs', body.runId, 'qa_result.json')),
            access(
              getScratchPath('training-roadmap-runs', body.runId, 'versions', 'version-1.json'),
            ),
          ]),
        ),
      ).toBeDefined();
    } finally {
      if (typeof body.runId === 'string') {
        rmSync(getScratchPath('training-roadmap-runs', body.runId), {
          recursive: true,
          force: true,
        });
      }
      vi.stubEnv('TRAINING_ROADMAP_DATA_DIR', fixturesDir);
    }
  });

  it('reuses the canonical pipeline for feedback and persists a new final version', async () => {
    vi.stubEnv('TRAINING_ROADMAP_DATA_DIR', dataFirstFixturesDir);
    const generated = await app.request('/api/training-roadmap/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userPrompt: 'Create one Q3/2026 Security Testing initiative for Software Engineer.',
      }),
    });
    const initial = await generated.json();

    try {
      expect(generated.status).toBe(200);
      const feedback = await app.request('/api/training-roadmap/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          runId: initial.runId,
          feedback: 'Keep Security Testing in Q3/2026 with the evidence-backed cohort.',
        }),
      });
      const revised = await feedback.json();

      expect(feedback.status).toBe(200);
      expect(revised).toMatchObject({
        runId: initial.runId,
        draftInitiatives: [expect.objectContaining({ topic: 'Security Testing' })],
        reviewPack: {
          request: {
            userPrompt: expect.stringContaining('Reviewer feedback:'),
          },
        },
      });
      const version = readJsonFileOrDefault(
        getScratchPath('training-roadmap-runs', initial.runId, 'versions', 'version-2.json'),
        null,
      );
      expect(version).toMatchObject({
        runId: initial.runId,
        version: 2,
        feedback: 'Keep Security Testing in Q3/2026 with the evidence-backed cohort.',
        roadmap: { runId: initial.runId },
      });
      expect(
        readJsonFileOrDefault(
          getScratchPath('training-roadmap-runs', initial.runId, 'human_feedback.json'),
          null,
        ),
      ).toMatchObject({
        runId: initial.runId,
        feedback: 'Keep Security Testing in Q3/2026 with the evidence-backed cohort.',
      });
    } finally {
      if (typeof initial.runId === 'string') {
        rmSync(getScratchPath('training-roadmap-runs', initial.runId), {
          recursive: true,
          force: true,
        });
      }
      vi.stubEnv('TRAINING_ROADMAP_DATA_DIR', fixturesDir);
    }
  });

  it('passes the Agent 1 artifact through the QA agent pipeline', async () => {
    calls.length = 0;
    toolCalls.length = 0;
    generatedPrompts.length = 0;

    const res = await app.request('/api/training-roadmap/qa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'fixture-roadmap-run' }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reviewStatus).toBe('pending_review');
    expect(body.qaDecision).toBe('PASS_WITH_WARNINGS');
    expect(body.executionLog).toContain('Loaded roadmap_output_agent.json.');
    expect(body.initiatives).toHaveLength(22);
    expect(body.qaScore).toBeGreaterThanOrEqual(0);
    expect(body.qaScore).toBeLessThanOrEqual(100);
    expect(calls).toEqual(['training-roadmap.qa-reviewer']);
    expect(toolCalls).toEqual(Object.values(QA_TOOL_IDS));
    expect(generatedPrompts[0]).toContain(
      'Create a Q3 2026 engineering roadmap backed by the supplied evidence.',
    );
    expect(generatedPrompts[0]).toContain('"position":"Software Engineer"');
    expect(generatedPrompts[0]).toContain('"proficiency":"Intermediate"');
    expect(body.reviewPack).toMatchObject({
      request: {
        userPrompt: 'Create a Q3 2026 engineering roadmap backed by the supplied evidence.',
      },
    });
  });

  it('requires the Agent 1 runId for QA handoff', async () => {
    const res = await app.request('/api/training-roadmap/qa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ employees: [] }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'runId is required' });
  });

  it('loops Agent 2 findings back to Agent 1 and re-audits the revised roadmap', async () => {
    const runId = 'fixture-missing-project-qa';
    const runDirectory = getScratchPath('training-roadmap-runs', runId);
    rmSync(runDirectory, { recursive: true, force: true });
    vi.stubEnv('TRAINING_ROADMAP_OUTPUT_FILE', missingProjectFixture);

    try {
      const res = await app.request('/api/training-roadmap/qa', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runId }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toMatchObject({
        qaDecision: 'PASS_WITH_WARNINGS',
        reviewStatus: 'pending_review',
        revisionCount: 1,
        approvalRequirement: 'APPROVE_WITH_RISKS',
      });
      expect(body.initiatives[0]).toMatchObject({
        alignmentType: 'BOD_AND_SURVEY_ONLY',
        approvalRequired: true,
      });
      expect(body.executionLog).toContain('Agent 1 revised the roadmap from Agent 2 instructions.');
    } finally {
      vi.stubEnv('TRAINING_ROADMAP_OUTPUT_FILE', roadmapFixture);
      rmSync(runDirectory, { recursive: true, force: true });
    }
  });

  it('rejects a QA request whose runId does not match the Agent 1 artifact', async () => {
    const res = await app.request('/api/training-roadmap/qa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'another-run' }),
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'Agent 1 artifact belongs to run fixture-roadmap-run, not another-run',
    });
  });

  it('validates missing runId on approval', async () => {
    const res = await app.request('/api/training-roadmap/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approved' }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'runId is required' });
  });

  it('requires written feedback before regenerating a roadmap', async () => {
    const res = await app.request('/api/training-roadmap/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'fixture-roadmap-run', feedback: '   ' }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'feedback is required' });
  });

  it('validates invalid approval decisions', async () => {
    const res = await app.request('/api/training-roadmap/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'run-1', decision: 'pending' }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid decision' });
  });

  it('returns a token only for approved decisions', async () => {
    await app.request('/api/training-roadmap/qa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'fixture-roadmap-run' }),
    });

    const lockedExport = await app.request('/api/training-roadmap/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'fixture-roadmap-run' }),
    });
    expect(lockedExport.status).toBe(409);

    const missingNote = await app.request('/api/training-roadmap/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        runId: 'fixture-roadmap-run',
        decision: 'approved_with_risks',
      }),
    });
    expect(missingNote.status).toBe(400);

    const approved = await app.request('/api/training-roadmap/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        runId: 'fixture-roadmap-run',
        decision: 'approved_with_risks',
        approvalNote: 'Accepted test fixture fallbacks.',
      }),
    });
    const approvedBody = await approved.json();

    expect(approved.status).toBe(200);
    expect(approvedBody.approvalToken).toMatch(/^APPROVAL-fixture-roadmap-run-/);

    const exported = await app.request('/api/training-roadmap/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'fixture-roadmap-run' }),
    });
    expect(exported.status).toBe(200);
    await expect(exported.json()).resolves.toMatchObject({
      qaDecision: 'PASS_WITH_WARNINGS',
      approvalNotes: 'Accepted test fixture fallbacks.',
    });

    await app.request('/api/training-roadmap/qa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'fixture-roadmap-run' }),
    });

    const rejected = await app.request('/api/training-roadmap/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'fixture-roadmap-run', decision: 'rejected' }),
    });

    expect(rejected.status).toBe(200);
    await expect(rejected.json()).resolves.toMatchObject({ approvalToken: null });
  });

  it('does not approve an unknown or demo run', async () => {
    const res = await app.request('/api/training-roadmap/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'demo-member1-snapshot', decision: 'approved' }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'QA run not found' });
  });

  it('rejects feedback once the run has already been approved', async () => {
    await app.request('/api/training-roadmap/qa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'fixture-roadmap-run' }),
    });
    await app.request('/api/training-roadmap/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        runId: 'fixture-roadmap-run',
        decision: 'approved_with_risks',
        approvalNote: 'Accepted for this test.',
      }),
    });

    const res = await app.request('/api/training-roadmap/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'fixture-roadmap-run', feedback: 'Please redo this.' }),
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'Run fixture-roadmap-run is already approved_with_risks',
    });
  });
});
