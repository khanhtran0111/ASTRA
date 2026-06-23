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
                  {initiative.objective && (
                    <div className="mt-1 text-caption text-ink-subtle">
                      <strong>Objective:</strong> {initiative.objective}
                    </div>
                  )}
                  {initiative.selectionReason && (
                    <div className="mt-1 text-caption text-ink-subtle">
                      <strong>Selected:</strong> {initiative.selectionReason}
                    </div>
                  )}
                  {initiative.prerequisites && initiative.prerequisites.length > 0 && (
                    <div className="mt-1 text-caption text-ink-subtle">
                      <strong>Prerequisites:</strong> {initiative.prerequisites.join(', ')}
                    </div>
                  )}
                  {initiative.alignmentType && (
                    <div className="mt-1 text-caption text-ink-subtle">
                      <strong>Alignment:</strong> {initiative.alignmentType.replaceAll('_', ' ')}
                      {initiative.approvalRequired ? ' · Human risk approval required' : ''}
                    </div>
                  )}
                  {initiative.alignmentNote && (
                    <div className="mt-1 text-caption text-ink-subtle">
                      {initiative.alignmentNote}
                    </div>
                  )}
                  {initiative.evaluationCriteria && (
                    <div className="mt-1 text-caption text-ink-subtle text-green-700">
                      <strong>Eval:</strong> {initiative.evaluationCriteria}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div>{initiative.quarter}</div>
                  {initiative.timeline && (
                    <div className="mt-1 text-caption text-ink-subtle">
                      Week {initiative.timeline.startWeek}–{initiative.timeline.endWeek}
                    </div>
                  )}
                </TableCell>
                <TableCell className="min-w-56">
                  <div className="space-y-2">
                    {initiative.traineeDetails?.length
                      ? initiative.traineeDetails.map((trainee) => (
                          <div key={trainee.employeeId}>
                            <div className="font-medium text-ink">{trainee.employeeId}</div>
                            <div className="text-caption text-ink-subtle">
                              {trainee.position} · {trainee.proficiencyLevel}
                            </div>
                            <div
                              className="text-caption text-ink-subtle"
                              title={trainee.evidenceRefs
                                .map(
                                  (evidence) =>
                                    `${evidence.source}.${evidence.field}=${evidence.value}\n${evidence.reason}`,
                                )
                                .join('\n\n')}
                            >
                              Gap: {trainee.matchedSkillGap.join(', ')}
                            </div>
                          </div>
                        ))
                      : initiative.targetTrainees.join(', ')}
                  </div>
                </TableCell>
                <TableCell className="min-w-48">
                  <div>{initiative.trainerName ?? 'External fallback'}</div>
                  {initiative.fallbackReason && (
                    <div className="mt-1 text-caption text-ink-subtle">
                      {initiative.fallbackReason}
                    </div>
                  )}
                  {initiative.trainerCandidates?.map((trainer) => (
                    <div
                      key={trainer.trainerId}
                      className="mt-1 text-caption text-ink-subtle"
                      title={`Matched: ${trainer.matchedSkills.join(', ')}\nAvailable: ${trainer.availabilityHoursPerMonth}h/month`}
                    >
                      {trainer.trainerId} · fit {trainer.fitScore} · {trainer.capacityStatus}
                    </div>
                  ))}
                </TableCell>
                <TableCell>
                  <div className="capitalize">
                    {(initiative.deliveryFormat ?? initiative.format)
                      .replace(/_/g, ' ')
                      .toLowerCase()}
                  </div>
                  {initiative.formatExplanation && (
                    <div className="mt-1 text-caption text-ink-subtle">
                      {initiative.formatExplanation}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div>{initiative.totalHours ?? initiative.estimatedHours}h total</div>
                  {initiative.trainerContactHours !== undefined && (
                    <div className="mt-1 text-caption text-ink-subtle">
                      Contact {initiative.trainerContactHours}h · Self {initiative.selfStudyHours}h
                      · Lab {initiative.labHours}h
                    </div>
                  )}
                  {initiative.durationWeeks && (
                    <div className="mt-1 text-caption text-ink-subtle">
                      {initiative.durationWeeks} weeks
                    </div>
                  )}
                  {initiative.scoreBreakdown && (
                    <div
                      className="mt-1 text-caption text-ink-subtle"
                      title={Object.entries(initiative.scoreBreakdown)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join('\n')}
                    >
                      Score breakdown available
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex min-w-48 flex-wrap gap-1">
                    {initiative.evidence.map((item) => (
                      <span
                        key={`${item.source}-${item.recordId}-${item.field}`}
                        title={`${item.field}: ${item.value}\n${item.reason}`}
                      >
                        <Badge variant="outline">
                          {item.source} · {item.recordId}
                        </Badge>
                      </span>
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
