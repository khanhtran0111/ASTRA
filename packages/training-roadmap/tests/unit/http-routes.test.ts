import type { StructuredAgentRuntime } from '@seta/core';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { QA_TOOL_IDS } from '../../src/backend/agent-tools.ts';
import {
  markQaToolCalled,
  recordQaScoreCall,
} from '../../src/backend/domain/qa/qa-tool-context.ts';
import { buildTrainingRoadmapRoutes } from '../../src/backend/http/index.ts';

const calls: string[] = [];
const toolCalls: string[] = [];
const agents: StructuredAgentRuntime = {
  async generate<T>({ agentId, schema }: { agentId: string; schema: z.ZodType<T> }): Promise<T> {
    calls.push(agentId);
    if (!agentId.endsWith('qa-reviewer')) throw new Error(`Unexpected agent: ${agentId}`);
    return schema.parse({
      findings: [],
      semanticSummary: [],
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

  it('runs the real-agent roadmap pipeline', async () => {
    calls.length = 0;
    toolCalls.length = 0;
    const res = await app.request('/api/training-roadmap/run', { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reviewStatus).toBe('pending');
    expect(body.executionLog).toContain('Paused at Human Review Gate.');
    expect(body.initiatives).toHaveLength(22);
    expect(body.executionLog).toContain('Loaded roadmap_output_agent.json.');
    expect(body.qaScore).toBeGreaterThanOrEqual(0);
    expect(body.qaScore).toBeLessThanOrEqual(100);
    expect(
      body.qaFindings.every((finding: { evidence: unknown[] }) => finding.evidence.length > 0),
    ).toBe(true);
    expect(calls).toEqual(['training-roadmap.qa-reviewer']);
    expect(toolCalls).toEqual(Object.values(QA_TOOL_IDS));
  });

  it('uses roadmap_output_agent.json instead of a request-body roadmap', async () => {
    calls.length = 0;
    toolCalls.length = 0;
    const res = await app.request('/api/training-roadmap/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ employees: [] }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.initiatives).toHaveLength(22);
    expect(calls).toEqual(['training-roadmap.qa-reviewer']);
    expect(toolCalls).toEqual(Object.values(QA_TOOL_IDS));
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
    const approved = await app.request('/api/training-roadmap/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'run-1', decision: 'approved' }),
    });
    const approvedBody = await approved.json();

    expect(approved.status).toBe(200);
    expect(approvedBody.approvalToken).toMatch(/^APPROVAL-/);

    const rejected = await app.request('/api/training-roadmap/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'run-1', decision: 'rejected' }),
    });

    expect(rejected.status).toBe(200);
    await expect(rejected.json()).resolves.toMatchObject({ approvalToken: null });
  });
});
