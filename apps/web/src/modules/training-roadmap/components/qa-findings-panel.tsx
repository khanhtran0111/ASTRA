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
import type { QaFinding, QaRisk } from '../types.ts';

const riskVariant = {
  HIGH: 'destructive',
  MEDIUM: 'warning',
  LOW: 'success',
} as const satisfies Record<QaRisk, ComponentProps<typeof Badge>['variant']>;

export function QaFindingsPanel({ findings }: { findings: QaFinding[] }) {
  const counts = findings.reduce(
    (acc, finding) => {
      acc[finding.risk] += 1;
      return acc;
    },
    { HIGH: 0, MEDIUM: 0, LOW: 0 } satisfies Record<QaRisk, number>,
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 gap-3">
        <CardTitle>QA Findings</CardTitle>
        <div className="flex flex-wrap justify-end gap-1">
          {(['HIGH', 'MEDIUM', 'LOW'] as const).map((risk) => (
            <Badge key={risk} variant={riskVariant[risk]}>
              {risk}: {counts[risk]}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Risk</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Related Initiative</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {findings.map((finding) => (
              <TableRow key={finding.id}>
                <TableCell>
                  <Badge variant={riskVariant[finding.risk]}>{finding.risk}</Badge>
                </TableCell>
                <TableCell className="min-w-80">{finding.message}</TableCell>
                <TableCell>{finding.relatedInitiativeId ?? 'N/A'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
