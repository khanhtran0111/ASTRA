import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@seta/shared-ui';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import type { ComponentProps } from 'react';
import type { ApprovalDecision, ReviewStatus, RoadmapResult } from '../types.ts';

const statusLabel: Record<ReviewStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  revision_requested: 'Revision Requested',
  rejected: 'Rejected',
};

const statusVariant = {
  pending: 'warning',
  approved: 'success',
  revision_requested: 'secondary',
  rejected: 'destructive',
} as const satisfies Record<ReviewStatus, ComponentProps<typeof Badge>['variant']>;

export function HitlApprovalCard({
  runId,
  reviewStatus,
  reviewPack,
  onDecision,
  disabled = false,
}: {
  runId: string;
  reviewStatus: ReviewStatus;
  reviewPack: RoadmapResult['reviewPack'];
  onDecision: (decision: ApprovalDecision) => Promise<void>;
  disabled?: boolean;
}) {
  const locked = disabled || reviewStatus !== 'pending';

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
          <div className="font-medium text-ink">Review Pack</div>
          <div className="mt-1 text-caption text-ink-subtle">
            {reviewPack.initiativeCount} initiative(s) · generated{' '}
            {new Date(reviewPack.generatedAt).toLocaleString()}
          </div>
          <div className="mt-2 text-body-sm text-ink">{reviewPack.request.userPrompt}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={locked} onClick={() => onDecision('approved')}>
            <CheckCircle2 aria-hidden />
            Approve
          </Button>
          <Button
            disabled={locked}
            variant="secondary"
            onClick={() => onDecision('revision_requested')}
          >
            <RotateCcw aria-hidden />
            Request Revision
          </Button>
          <Button disabled={locked} variant="destructive" onClick={() => onDecision('rejected')}>
            <XCircle aria-hidden />
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
