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
import { getScratchPath } from '../../src/backend/scratch-storage.ts';

const fixturesDir = fileURLToPath(new URL('../helpers/fixtures', import.meta.url));
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
});
