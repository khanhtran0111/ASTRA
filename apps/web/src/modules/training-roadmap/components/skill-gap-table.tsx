import {
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
import type { SkillGapSummary } from '../types.ts';

export function SkillGapTable({ gaps }: { gaps: SkillGapSummary[] }) {
  const maxEmployees = Math.max(...gaps.map((gap) => gap.employeeCount), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Declared skill gaps</CardTitle>
        <CardDescription>
          Highest-frequency gaps from employee profiles, before roadmap scheduling.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Skill</TableHead>
              <TableHead>Employees</TableHead>
              <TableHead>Workforce</TableHead>
              <TableHead className="min-w-36">Relative demand</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gaps.map((gap) => (
              <TableRow key={gap.skill}>
                <TableCell className="font-medium text-ink">{gap.skill}</TableCell>
                <TableCell className="tabular-nums">{gap.employeeCount}</TableCell>
                <TableCell className="tabular-nums">{gap.percentOfWorkforce}%</TableCell>
                <TableCell>
                  <div
                    aria-label={`${gap.skill} relative demand`}
                    aria-valuemax={maxEmployees}
                    aria-valuemin={0}
                    aria-valuenow={gap.employeeCount}
                    className="h-2 overflow-hidden rounded-full bg-surface-2"
                    role="progressbar"
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(gap.employeeCount / maxEmployees) * 100}%` }}
                    />
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
