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

export function QaFindingsPanel({
  findings,
  score,
  riskLevel,
  riskReason,
}: {
  findings: QaFinding[];
  score: number;
  riskLevel: QaRisk;
  riskReason: string;
}) {
  const counts = findings.reduce(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { HIGH: 0, MEDIUM: 0, LOW: 0 } satisfies Record<QaRisk, number>,
  );
  const rank: Record<QaRisk, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
  const findingsByType = new Map<QaFinding['type'], QaFinding[]>();
  for (const finding of findings) {
    const group = findingsByType.get(finding.type) ?? [];
    group.push(finding);
    findingsByType.set(finding.type, group);
  }
  const groups = [...findingsByType].map(([type, groupedFindings]) => ({
    type,
    findings: groupedFindings,
    severity: groupedFindings.reduce<QaRisk>(
      (highest, finding) => (rank[finding.severity] > rank[highest] ? finding.severity : highest),
      'LOW',
    ),
  }));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 gap-3">
        <CardTitle>QA Findings</CardTitle>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Badge variant={riskVariant[riskLevel]}>
            QA score {score}/100 · {riskLevel} risk
          </Badge>
          {(['HIGH', 'MEDIUM', 'LOW'] as const).map((risk) => (
            <Badge key={risk} variant={riskVariant[risk]}>
              {risk}: {counts[risk]}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-body-sm text-ink-subtle">{riskReason}</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Risk</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Affected Initiatives</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {findings.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-ink-subtle">
                  QA completed with no findings for this draft.
                </TableCell>
              </TableRow>
            )}
            {groups.map((group) => (
              <TableRow key={group.type}>
                <TableCell>
                  <Badge variant={riskVariant[group.severity]}>{group.severity}</Badge>
                </TableCell>
                <TableCell className="min-w-64 align-top">
                  <div className="font-medium text-ink">
                    {group.type} ({group.findings.length})
                  </div>
                  <div className="mt-1 text-caption text-ink-subtle">
                    {group.findings[0]?.message}
                  </div>
                </TableCell>
                <TableCell>
                  <ul className="space-y-1 text-body-sm">
                    {group.findings.map((finding) => (
                      <li
                        key={`${finding.relatedInitiativeId ?? 'unknown'}-${finding.skill ?? finding.message}`}
                      >
                        {finding.relatedInitiativeId ?? 'N/A'}
                        {finding.skill ? ` (${finding.skill})` : ''}
                      </li>
                    ))}
                  </ul>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
