import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { describe, expect, it } from 'vitest';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { buildTrainingRoadmapRoutes } from '../../src/backend/http/index.ts';

const app = buildTrainingRoadmapRoutes({} as never);

describe('training roadmap routes', () => {
  it('reports health', async () => {
    const res = await app.request('/api/training-roadmap/health');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, module: 'training-roadmap' });
  });

  it('runs the real roadmap pipeline with real data', async () => {
    const res = await app.request('/api/training-roadmap/run', { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reviewStatus).toBe('pending');
    expect(body.executionLog).toContain('Paused at Human Review Gate.');
    // Real pipeline processes all initiatives from priority_result.json
    expect(body.initiatives.length).toBeGreaterThan(0);
    expect(body.qaFindings.length).toBeGreaterThanOrEqual(1);
    // New draft roadmap format is also present
    expect(body.draftRoadmap).toBeDefined();
    // Verify structure of first initiative
    const first = body.initiatives[0];
    expect(first.id).toMatch(/^CLS-/);
    expect(first.topic).toBeTruthy();
    expect(typeof first.score).toBe('number');
  }, 60_000);

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
