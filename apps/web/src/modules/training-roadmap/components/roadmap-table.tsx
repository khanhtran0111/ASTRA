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
import type { ComponentProps } from 'react';
import type { Priority, TrainingInitiative } from '../types.ts';

const priorityVariant = {
  P1: 'destructive',
  P2: 'warning',
  P3: 'secondary',
} as const satisfies Record<Priority, ComponentProps<typeof Badge>['variant']>;

export function RoadmapTable({ initiatives }: { initiatives: TrainingInitiative[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Draft Roadmap</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Priority</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead>Quarter</TableHead>
              <TableHead>Trainees</TableHead>
              <TableHead>Trainer</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Evidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initiatives.map((initiative) => (
              <TableRow key={initiative.id}>
                <TableCell>
                  <Badge variant={priorityVariant[initiative.priority]}>
                    {initiative.priority}
                  </Badge>
                </TableCell>
                <TableCell className="min-w-56">
                  <div className="font-medium text-ink">{initiative.topic}</div>
                  <div className="mt-1 text-caption text-ink-subtle">
                    {initiative.id} · Score {initiative.score}
                  </div>
                  {initiative.evaluationCriteria && (
                    <div className="mt-1 text-caption text-ink-subtle text-green-700">
                      <strong>Eval:</strong> {initiative.evaluationCriteria}
                    </div>
                  )}
                </TableCell>
                <TableCell>{initiative.quarter}</TableCell>
                <TableCell className="min-w-44">{initiative.targetTrainees.join(', ')}</TableCell>
                <TableCell className="min-w-48">
                  <div>{initiative.trainerName ?? 'External fallback'}</div>
                  {initiative.fallbackReason && (
                    <div className="mt-1 text-caption text-ink-subtle">
                      {initiative.fallbackReason}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="capitalize">
                    {initiative.format.replace(/_/g, ' ').toLowerCase()}
                  </div>
                  {initiative.formatExplanation && (
                    <div className="mt-1 text-caption text-ink-subtle">
                      {initiative.formatExplanation}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div>{initiative.estimatedHours}h</div>
                  {initiative.durationWeeks && (
                    <div className="mt-1 text-caption text-ink-subtle">
                      {initiative.durationWeeks} weeks
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex min-w-48 flex-wrap gap-1">
                    {initiative.evidence.map((item) => (
                      <Badge key={item} variant="outline">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
