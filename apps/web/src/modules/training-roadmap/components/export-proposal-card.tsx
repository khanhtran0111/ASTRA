import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@seta/shared-ui';
import { Download, Loader2, LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { exportTrainingRoadmap } from '../api/training-roadmap-client.ts';
import type { RoadmapResult } from '../types.ts';

export function ExportProposalCard({
  result,
  approvalToken,
}: {
  result: RoadmapResult;
  approvalToken?: string | null;
}) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasValidApproval =
    (result.qaDecision === 'PASS' && result.reviewStatus === 'approved') ||
    (result.qaDecision === 'PASS_WITH_WARNINGS' && result.reviewStatus === 'approved_with_risks');
  const canExport = hasValidApproval && Boolean(approvalToken);

  const exportJson = async () => {
    if (!canExport || exporting) return;
    setExporting(true);
    setError(null);
    try {
      const proposal = await exportTrainingRoadmap(result.runId);
      const blob = new Blob([JSON.stringify(proposal, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'astra-training-roadmap-proposal.json';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Failed to export proposal');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 gap-3">
        <CardTitle>Export Proposal</CardTitle>
        <Badge variant={canExport ? 'success' : 'secondary'}>
          {canExport ? 'Ready' : 'Locked'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {!canExport && (
          <div className="flex items-start gap-2 text-body-sm text-ink-subtle">
            <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden />
            {result.qaDecision === 'BLOCKED'
              ? 'QA blocked this roadmap.'
              : result.qaDecision === 'REVISE_REQUIRED'
                ? 'Agent 1 revision is required before export.'
                : result.qaDecision === 'PASS_WITH_WARNINGS'
                  ? 'Warnings require explicit approve-with-risks.'
                  : 'Human approval is required before export.'}
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!canExport || exporting} onClick={() => void exportJson()}>
            {exporting ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Download aria-hidden />
            )}
            Export JSON
          </Button>
          {approvalToken && (
            <span className="font-mono text-caption text-ink-subtle">{approvalToken}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
