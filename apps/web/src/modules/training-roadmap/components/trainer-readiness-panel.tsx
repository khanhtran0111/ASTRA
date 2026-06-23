import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@seta/shared-ui';
import { AlertTriangle, UsersRound } from 'lucide-react';
import type { ComponentProps } from 'react';
import type { Priority, TrainingAnalysisSnapshot } from '../types.ts';

const priorityVariant = {
  P1: 'destructive',
  P2: 'warning',
  P3: 'secondary',
} as const satisfies Record<Priority, ComponentProps<typeof Badge>['variant']>;

export function TrainerReadinessPanel({ snapshot }: { snapshot: TrainingAnalysisSnapshot }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trainer readiness</CardTitle>
        <CardDescription>
          Supply signals available now; exact trainer-to-trainee matching will plug into this panel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-hairline bg-canvas px-4 py-3">
            <div className="flex items-center gap-2 text-body-sm text-ink-subtle">
              <UsersRound aria-hidden className="size-4" />
              Internal trainers
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">
              {snapshot.metrics.internalTrainers}
            </div>
          </div>
          <div className="rounded-lg border border-hairline bg-canvas px-4 py-3">
            <div className="flex items-center gap-2 text-body-sm text-ink-subtle">
              <AlertTriangle aria-hidden className="size-4" />
              Skills without coverage
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">
              {snapshot.metrics.uncoveredSkills}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {snapshot.trainerCoverageGaps.map((gap) => (
            <div
              key={gap.skill}
              className="flex items-center justify-between gap-3 rounded-md border border-hairline px-3 py-2"
            >
              <div>
                <div className="font-medium text-ink">{gap.skill}</div>
                <div className="text-caption text-ink-subtle">
                  {gap.targetEmployeeCount} potential trainees
                </div>
              </div>
              <Badge variant={priorityVariant[gap.priority]}>{gap.priority}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
