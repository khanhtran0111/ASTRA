import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@seta/shared-ui';
import { CheckCircle2, FileSpreadsheet } from 'lucide-react';
import type { TrainingAnalysisSnapshot } from '../types.ts';

export function DatasetReadinessPanel({ snapshot }: { snapshot: TrainingAnalysisSnapshot }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-4">
        <div>
          <CardTitle>Dataset readiness</CardTitle>
          <CardDescription className="mt-1">
            Every source has been normalized and passed the preprocessing check.
          </CardDescription>
        </div>
        <Badge variant="success">5 / 5 ready</Badge>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {snapshot.datasets.map((dataset) => (
            <div key={dataset.id} className="rounded-lg border border-hairline bg-canvas px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-body-sm font-semibold text-ink">
                  <FileSpreadsheet aria-hidden className="size-4 text-primary" />
                  {dataset.id}
                </div>
                <CheckCircle2
                  aria-label={`${dataset.id} ready`}
                  className="size-4 text-semantic-success"
                />
              </div>
              <div className="mt-3 text-body-sm font-medium text-ink">{dataset.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">
                {dataset.recordCount}
              </div>
              <div className="mt-1 text-caption text-ink-subtle">{dataset.detail}</div>
              <div
                className="mt-3 truncate font-mono text-[11px] text-ink-muted"
                title={dataset.fileName}
              >
                {dataset.fileName}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
