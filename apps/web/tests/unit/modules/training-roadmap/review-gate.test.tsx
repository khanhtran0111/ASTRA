import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExportProposalCard } from '../../../../src/modules/training-roadmap/components/export-proposal-card';
import { HitlApprovalCard } from '../../../../src/modules/training-roadmap/components/hitl-approval-card';
import type { RoadmapResult } from '../../../../src/modules/training-roadmap/types';

const reviewPack: RoadmapResult['reviewPack'] = {
  request: { userPrompt: 'Frontend roadmap' },
  generatedAt: '2026-06-22T00:00:00.000Z',
  initiativeCount: 1,
  semanticSummary: [],
  findings: [],
};

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
    qaSummary: 'Passed.',
    qaScore: 100,
    riskLevel: 'LOW',
    riskReason: 'No findings.',
    revisionCount: 0,
    reviewPack,
    ...overrides,
  };
}

describe('training roadmap human quality gate', () => {
  it('offers human approval when QA passes', async () => {
    const onDecision = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <HitlApprovalCard
        runId="run-1"
        reviewStatus="pending_review"
        qaDecision="PASS"
        approvalRequirement="HUMAN_APPROVAL"
        reviewPack={reviewPack}
        onDecision={onDecision}
        onRevision={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onDecision).toHaveBeenCalledWith('approved');
  });

  it('requires a note before approve-with-risks', async () => {
    const onDecision = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <HitlApprovalCard
        runId="run-1"
        reviewStatus="pending_review"
        qaDecision="PASS_WITH_WARNINGS"
        approvalRequirement="APPROVE_WITH_RISKS"
        reviewPack={reviewPack}
        onDecision={onDecision}
        onRevision={vi.fn()}
      />,
    );

    const approve = screen.getByRole('button', { name: 'Approve with risks' });
    expect(approve).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Approval note (required)'), 'Accept pilot risk.');
    await user.click(approve);
    expect(onDecision).toHaveBeenCalledWith('approved_with_risks', 'Accept pilot risk.');
  });

  it('exposes only request revision for REVISE_REQUIRED', () => {
    render(
      <HitlApprovalCard
        runId="run-1"
        reviewStatus="pending_review"
        qaDecision="REVISE_REQUIRED"
        approvalRequirement="REVISION_REQUIRED"
        reviewPack={reviewPack}
        onDecision={vi.fn()}
        onRevision={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Request Revision' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });

  it.each([
    ['BLOCKED', 'blocked'],
    ['REVISE_REQUIRED', 'pending_review'],
  ] as const)('locks export for %s', (qaDecision, reviewStatus) => {
    render(
      <ExportProposalCard
        result={result({ qaDecision, reviewStatus })}
        approvalToken="APPROVAL-run-1"
      />,
    );

    expect(screen.getByRole('button', { name: 'Export JSON' })).toBeDisabled();
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('locks export until human approval produces a token', () => {
    render(<ExportProposalCard result={result({ reviewStatus: 'approved' })} />);

    expect(screen.getByRole('button', { name: 'Export JSON' })).toBeDisabled();
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });
});
