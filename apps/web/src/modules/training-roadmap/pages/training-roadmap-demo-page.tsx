import { Alert, AlertDescription, Button, EmptyState, PageChrome, Skeleton } from '@seta/shared-ui';
import { AlertCircle, Play, Route } from 'lucide-react';
import { useCallback, useState } from 'react';
import { runTrainingRoadmap, submitReviewDecision } from '../api/training-roadmap-client.ts';
import { ExecutionLogPanel } from '../components/execution-log-panel.tsx';
import { ExportProposalCard } from '../components/export-proposal-card.tsx';
import { HitlApprovalCard } from '../components/hitl-approval-card.tsx';
import { QaFindingsPanel } from '../components/qa-findings-panel.tsx';
import { RoadmapTable } from '../components/roadmap-table.tsx';
import type { ApprovalDecision, RoadmapResult } from '../types.ts';

const decisionLog: Record<ApprovalDecision, string> = {
  approved: 'Human reviewer approved the roadmap.',
  revision_requested: 'Human reviewer requested a revision.',
  rejected: 'Human reviewer rejected the roadmap.',
};

export function TrainingRoadmapDemoPage() {
  const [result, setResult] = useState<RoadmapResult | null>(null);
  const [approvalToken, setApprovalToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    setApprovalToken(null);

    try {
      setResult(await runTrainingRoadmap());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run training roadmap pipeline');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDecision = useCallback(
    async (decision: ApprovalDecision) => {
      if (!result) return;

      setReviewSubmitting(true);
      setError(null);

      try {
        const response = await submitReviewDecision(result.runId, decision);
        setApprovalToken(response.approvalToken);
        setResult((current) =>
          current
            ? {
                ...current,
                reviewStatus: response.reviewStatus,
                executionLog: [...current.executionLog, decisionLog[response.reviewStatus]],
              }
            : current,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit review decision');
      } finally {
        setReviewSubmitting(false);
      }
    },
    [result],
  );

  return (
    <PageChrome
      breadcrumb={['ASTRA']}
      title="Training Roadmap"
      subtitle="Skill gap demo pipeline"
      actions={
        <Button onClick={handleRun} disabled={loading || reviewSubmitting}>
          <Play aria-hidden />
          {result ? 'Generate Again' : 'Generate Roadmap'}
        </Button>
      }
    >
      <div className="space-y-4 p-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
        )}

        {!loading && !result && (
          <EmptyState
            icon={<Route className="size-6" />}
            title="No roadmap run yet"
            description="Generate a draft roadmap from the mock ASTRA pipeline."
          />
        )}

        {!loading && result && (
          <div className="grid gap-4">
            <ExecutionLogPanel logs={result.executionLog} />
            <RoadmapTable initiatives={result.initiatives} />
            <QaFindingsPanel findings={result.qaFindings} />
            <div className="grid gap-4 xl:grid-cols-2">
              <HitlApprovalCard
                runId={result.runId}
                reviewStatus={result.reviewStatus}
                onDecision={handleDecision}
                disabled={reviewSubmitting}
              />
              <ExportProposalCard result={result} approvalToken={approvalToken} />
            </div>
          </div>
        )}
      </div>
    </PageChrome>
  );
}
