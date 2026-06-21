import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@seta/shared-ui';
import { Download } from 'lucide-react';
import type { RoadmapResult } from '../types.ts';

export function ExportProposalCard({
  result,
  approvalToken,
}: {
  result: RoadmapResult;
  approvalToken?: string | null;
}) {
  const canExport = result.reviewStatus === 'approved' && Boolean(approvalToken);

  const exportJson = () => {
    if (!canExport) return;

    const blob = new Blob(
      [
        JSON.stringify(
          {
            approvalToken,
            exportedAt: new Date().toISOString(),
            result,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'astra-training-roadmap-proposal.json';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 gap-3">
        <CardTitle>Export Proposal</CardTitle>
        <Badge variant={canExport ? 'success' : 'secondary'}>
          {canExport ? 'Ready' : 'Locked'}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!canExport} onClick={exportJson}>
            <Download aria-hidden />
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
