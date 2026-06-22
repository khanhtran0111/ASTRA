import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@seta/shared-ui';
import type { RoadmapResult } from '../types.ts';

export function DataCoveragePanel({ result }: { result: RoadmapResult }) {
  if (!result.dataInventory || !result.dataCoverageReport) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 gap-3">
        <CardTitle>Data Coverage</CardTitle>
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">{result.dataCoverageReport.candidateCount} candidates</Badge>
          <Badge variant="success">{result.dataCoverageReport.selectedCount} selected</Badge>
          <Badge variant="outline">{result.dataCoverageReport.droppedCount} dropped</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Rows</TableHead>
              <TableHead>Valid</TableHead>
              <TableHead>Invalid</TableHead>
              <TableHead>Detected columns</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.dataInventory.map((source) => (
              <TableRow key={source.sourceId}>
                <TableCell>
                  <div className="font-medium text-ink">{source.sourceId}</div>
                  <div className="text-caption text-ink-subtle">{source.fileName}</div>
                </TableCell>
                <TableCell>{source.rowCount}</TableCell>
                <TableCell>{source.validRows}</TableCell>
                <TableCell>{source.invalidRows}</TableCell>
                <TableCell className="max-w-xl text-caption text-ink-subtle">
                  {source.detectedColumns.join(', ') || 'Source unavailable'}
                  {source.warnings.map((warning) => (
                    <div key={warning} className="mt-1 text-warning">
                      {warning}
                    </div>
                  ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {result.dataCoverageReport.coverageResult && (
          <div className="flex flex-wrap items-center gap-2 border-y border-hairline py-3 text-body-sm">
            <Badge
              variant={
                result.dataCoverageReport.coverageResult.coverageStatus === 'MET'
                  ? 'success'
                  : 'warning'
              }
            >
              {result.dataCoverageReport.coverageResult.coverageStatus}
            </Badge>
            <span className="font-medium text-ink">
              {result.dataCoverageReport.coverageResult.achievedCoveragePercent}% of{' '}
              {result.dataCoverageReport.coverageResult.targetGroup}
            </span>
            <span className="text-ink-subtle">
              {result.dataCoverageReport.coverageResult.selectedTraineeCount}/
              {result.dataCoverageReport.coverageResult.requiredTraineeCount} required trainees
            </span>
          </div>
        )}

        {result.toolTrace && (
          <section aria-labelledby="data-tool-trace-title">
            <h3 id="data-tool-trace-title" className="mb-2 font-medium text-ink">
              Deterministic Tool Trace
            </h3>
            <ol className="space-y-1 text-body-sm">
              {result.toolTrace.map((entry, index) => (
                <li key={entry.tool} className="flex gap-2">
                  <span className="font-mono text-ink-subtle">{index + 1}.</span>
                  <span className="font-medium text-ink">{entry.tool}</span>
                  <span className="text-ink-subtle">{entry.detail}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {result.unselectedCandidates && result.unselectedCandidates.length > 0 && (
          <section aria-labelledby="unselected-candidates-title">
            <h3 id="unselected-candidates-title" className="mb-2 font-medium text-ink">
              Unselected Candidates ({result.unselectedCandidates.length})
            </h3>
            <div className="max-h-72 overflow-auto border-y border-hairline">
              {result.unselectedCandidates.map((candidate) => (
                <div
                  key={`${candidate.candidate}-${candidate.reasonDropped}`}
                  className="grid gap-1 border-b border-hairline py-2 last:border-b-0 md:grid-cols-[minmax(12rem,0.4fr)_minmax(0,1fr)]"
                >
                  <div>
                    <div className="font-medium text-ink">{candidate.candidate}</div>
                    <Badge variant="outline">{candidate.reasonDropped}</Badge>
                  </div>
                  <div className="text-body-sm text-ink-subtle">{candidate.suggestedFix}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
