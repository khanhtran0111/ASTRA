import { fileURLToPath } from 'node:url';
import type { StructuredAgentRuntime } from '@seta/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { QA_TOOL_IDS } from '../../src/backend/agent-tools.ts';
import {
  markQaToolCalled,
  recordQaScoreCall,
} from '../../src/backend/domain/qa/qa-tool-context.ts';
import { buildTrainingRoadmapRoutes } from '../../src/backend/http/index.ts';

const fixturesDir = fileURLToPath(new URL('../helpers/fixtures', import.meta.url));
const roadmapFixture = fileURLToPath(
  new URL('../helpers/fixtures/roadmap_output_agent.json', import.meta.url),
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
      recordQaScoreCall(runId, [], {
        score: 100,
        riskLevel: 'LOW',
        reason: 'QA tools returned no findings.',
      });
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
    expect(body.reviewStatus).toBe('pending');
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

    const approved = await app.request('/api/training-roadmap/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'fixture-roadmap-run', decision: 'approved' }),
    });
    const approvedBody = await approved.json();

    expect(approved.status).toBe(200);
    expect(approvedBody.approvalToken).toMatch(/^APPROVAL-fixture-roadmap-run-/);

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
