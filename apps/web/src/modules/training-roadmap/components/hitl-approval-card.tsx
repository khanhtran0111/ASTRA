import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@seta/shared-ui';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { type ComponentProps, useState } from 'react';
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
  onRevision,
  disabled = false,
}: {
  runId: string;
  reviewStatus: ReviewStatus;
  reviewPack: RoadmapResult['reviewPack'];
  onDecision: (decision: Exclude<ApprovalDecision, 'revision_requested'>) => Promise<void>;
  onRevision: (feedback: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [feedback, setFeedback] = useState('');
  const locked = disabled || reviewStatus !== 'pending';
  const trimmedFeedback = feedback.trim();

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
          <Button disabled={locked} variant="secondary" onClick={() => setShowRevisionForm(true)}>
            <RotateCcw aria-hidden />
            Request Revision
          </Button>
          <Button disabled={locked} variant="destructive" onClick={() => onDecision('rejected')}>
            <XCircle aria-hidden />
            Reject
          </Button>
        </div>
        {showRevisionForm && reviewStatus === 'pending' && (
          <div className="mt-4 space-y-3 rounded-md border border-hairline bg-canvas p-3">
            <div>
              <label htmlFor={`revision-feedback-${runId}`} className="font-medium text-ink">
                Revision feedback
              </label>
              <div className="mt-1 text-caption text-ink-subtle">
                Describe what the coordinator must change. The revised roadmap will run through QA
                again before returning to this review gate.
              </div>
            </div>
            <textarea
              id={`revision-feedback-${runId}`}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              disabled={disabled}
              rows={4}
              className="w-full rounded-md border border-hairline bg-surface-1 px-3 py-2 text-body-sm text-ink"
              placeholder="For example: move React testing to Q3 and shorten the internal workshop to two weeks."
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={disabled || !trimmedFeedback}
                onClick={() => onRevision(trimmedFeedback)}
              >
                <RotateCcw aria-hidden />
                Submit &amp; Regenerate
              </Button>
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={() => setShowRevisionForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
