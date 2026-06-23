import {
  Badge,
  Card,
  CardContent,
  CardDescription,
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
import type { Priority, PriorityAnalysisItem } from '../types.ts';

const priorityVariant = {
  P1: 'destructive',
  P2: 'warning',
  P3: 'secondary',
} as const satisfies Record<Priority, ComponentProps<typeof Badge>['variant']>;

export function PriorityScoreTable({ priorities }: { priorities: PriorityAnalysisItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Priority scoring</CardTitle>
        <CardDescription>
          Evidence-backed initiatives ranked for final scheduling and review.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Priority</TableHead>
              <TableHead>Skill</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Trainees</TableHead>
              <TableHead>Evidence</TableHead>
              <TableHead>Trainer readiness</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {priorities.map((item) => (
              <TableRow key={item.skill}>
                <TableCell>
                  <Badge variant={priorityVariant[item.priority]}>{item.priority}</Badge>
                </TableCell>
                <TableCell className="min-w-36 font-medium text-ink">{item.skill}</TableCell>
                <TableCell className="font-semibold tabular-nums text-ink">{item.score}</TableCell>
                <TableCell className="tabular-nums">{item.targetEmployeeCount}</TableCell>
                <TableCell className="min-w-72">
                  <div className="text-body-sm text-ink">{item.evidenceSummary}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {[...item.supportingGoals, ...item.supportingProjects].map((reference) => (
                      <Badge key={reference} variant="outline">
                        {reference}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="min-w-40">
                  {item.internalTrainers.length > 0 ? (
                    <div>
                      <Badge variant="success">Internal coverage</Badge>
                      <div className="mt-1 text-caption text-ink-subtle">
                        {item.internalTrainers.join(', ')}
                      </div>
                    </div>
                  ) : (
                    <Badge variant="warning">Matching required</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
