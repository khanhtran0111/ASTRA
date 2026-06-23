import { describe, expect, it } from 'vitest';
import { buildExportProposal } from '../../src/backend/domain/export-proposal.ts';
import type { RoadmapResult } from '../../src/types.ts';

function result(overrides: Partial<RoadmapResult> = {}): RoadmapResult {
  return {
    runId: 'run-1',
    reviewStatus: 'pending_review',
    executionLog: [],
    initiatives: [],
    qaDecision: 'PASS',
    qaFindings: [],
    blockingIssues: [],
    revisionInstructions: [],
    approvalRequirement: 'HUMAN_APPROVAL',
    qaSummary: 'QA passed.',
    qaScore: 100,
    riskLevel: 'LOW',
    riskReason: 'No findings.',
    revisionCount: 0,
    evidencePack: {},
    reviewPack: {
      request: { userPrompt: 'Roadmap' },
      generatedAt: '2026-06-22T00:00:00.000Z',
      initiativeCount: 0,
      semanticSummary: [],
      findings: [],
    },
    ...overrides,
  };
}

describe('training roadmap export guard', () => {
  it('exports a PASS result only after normal approval', () => {
    const proposal = buildExportProposal(
      result({
        reviewStatus: 'approved',
        approvalToken: 'APPROVAL-run-1-1',
        approvedBy: 'user-1',
        approvedAt: '2026-06-22T01:00:00.000Z',
      }),
    );

    expect(proposal).toMatchObject({
      qaDecision: 'PASS',
      riskLevel: 'LOW',
      approvedBy: 'user-1',
      revisionCount: 0,
    });
  });

  it('denies an approved result without a human approval token', () => {
    expect(() => buildExportProposal(result({ reviewStatus: 'approved' }))).toThrow(
      'Cannot export: human approval token required.',
    );
  });

  it.each([
    ['BLOCKED', 'blocked', 'Cannot export: QA decision is BLOCKED.'],
    ['REVISE_REQUIRED', 'pending_review', 'Cannot export: revision is required before approval.'],
  ] as const)('denies %s roadmaps', (qaDecision, reviewStatus, message) => {
    expect(() => buildExportProposal(result({ qaDecision, reviewStatus }))).toThrow(message);
  });

  it('requires explicit approve-with-risks and a note for warnings', () => {
    expect(() =>
      buildExportProposal(
        result({ qaDecision: 'PASS_WITH_WARNINGS', approvalRequirement: 'APPROVE_WITH_RISKS' }),
      ),
    ).toThrow('Cannot export: warnings require explicit approve-with-risks.');

    const proposal = buildExportProposal(
      result({
        qaDecision: 'PASS_WITH_WARNINGS',
        approvalRequirement: 'APPROVE_WITH_RISKS',
        reviewStatus: 'approved_with_risks',
        approvalToken: 'APPROVAL-run-1-2',
        approvalNotes: 'Accepted for the pilot with L&D oversight.',
        approvedAt: '2026-06-22T01:00:00.000Z',
      }),
    );
    expect(proposal.approvalNotes).toBe('Accepted for the pilot with L&D oversight.');
  });
});
