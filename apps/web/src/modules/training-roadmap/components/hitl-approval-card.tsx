import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@seta/shared-ui';
import { AlertTriangle, CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { type ComponentProps, useState } from 'react';
import type {
  ApprovalDecision,
  ApprovalRequirement,
  QaDecision,
  ReviewStatus,
  RoadmapResult,
} from '../types.ts';

const statusLabel: Record<ReviewStatus, string> = {
  pending_review: 'Pending Review',
  approved: 'Approved',
  approved_with_risks: 'Approved with Risks',
  revision_requested: 'Revision Requested',
  rejected: 'Rejected',
  blocked: 'Blocked',
};

const statusVariant = {
  pending_review: 'warning',
  approved: 'success',
  approved_with_risks: 'warning',
  revision_requested: 'secondary',
  rejected: 'destructive',
  blocked: 'destructive',
} as const satisfies Record<ReviewStatus, ComponentProps<typeof Badge>['variant']>;

export function HitlApprovalCard({
  runId,
  reviewStatus,
  qaDecision,
  approvalRequirement,
  reviewPack,
  onDecision,
  disabled = false,
}: {
  runId: string;
  reviewStatus: ReviewStatus;
  qaDecision: QaDecision;
  approvalRequirement: ApprovalRequirement;
  reviewPack: RoadmapResult['reviewPack'];
  onDecision: (decision: ApprovalDecision, approvalNote?: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [approvalNote, setApprovalNote] = useState('');
  const terminal = ['approved', 'approved_with_risks', 'revision_requested', 'rejected'].includes(
    reviewStatus,
  );
  const locked = disabled || terminal;
  const canApprove = qaDecision === 'PASS';
  const canApproveWithRisks = qaDecision === 'PASS_WITH_WARNINGS';
  const canReject = qaDecision !== 'REVISE_REQUIRED';

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 gap-3">
        <div>
          <CardTitle>Human Review Gate</CardTitle>
          <div className="mt-1 text-caption text-ink-subtle">Run {runId}</div>
        </div>
        <Badge variant={statusVariant[reviewStatus]}>{statusLabel[reviewStatus]}</Badge>
      </CardHeader>
      <CardContent>
        <div className="mb-4 rounded-md border border-hairline bg-canvas p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium text-ink">Review Pack</div>
            <Badge variant={qaDecision === 'PASS' ? 'success' : 'warning'}>{qaDecision}</Badge>
          </div>
          <div className="mt-1 text-caption text-ink-subtle">
            {reviewPack.initiativeCount} initiative(s) · generated{' '}
            {new Date(reviewPack.generatedAt).toLocaleString()}
          </div>
          <div className="mt-2 text-body-sm text-ink">{reviewPack.request.userPrompt}</div>
          <div className="mt-2 text-caption text-ink-subtle">
            Approval requirement: {approvalRequirement.replaceAll('_', ' ')}
          </div>
        </div>

        {canApproveWithRisks && !terminal && (
          <div className="mb-4 space-y-2">
            <label
              htmlFor={`approval-note-${runId}`}
              className="flex items-center gap-2 text-sm font-medium"
            >
              <AlertTriangle className="size-4 text-warning" aria-hidden />
              Approval note (required)
            </label>
            <Textarea
              id={`approval-note-${runId}`}
              value={approvalNote}
              onChange={(event) => setApprovalNote(event.target.value)}
              placeholder="Describe the accepted risks and required L&D oversight."
              rows={3}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {canApprove && (
            <Button disabled={locked} onClick={() => onDecision('approved')}>
              <CheckCircle2 aria-hidden />
              Approve
            </Button>
          )}
          {canApproveWithRisks && (
            <Button
              disabled={locked || !approvalNote.trim()}
              onClick={() => onDecision('approved_with_risks', approvalNote.trim())}
            >
              <AlertTriangle aria-hidden />
              Approve with risks
            </Button>
          )}
          <Button
            disabled={locked}
            variant="secondary"
            onClick={() => onDecision('revision_requested')}
          >
            <RotateCcw aria-hidden />
            Request Revision
          </Button>
          {canReject && (
            <Button disabled={locked} variant="destructive" onClick={() => onDecision('rejected')}>
              <XCircle aria-hidden />
              Reject
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
