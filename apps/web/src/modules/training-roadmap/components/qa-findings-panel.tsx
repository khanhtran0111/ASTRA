import { Badge, Card, CardContent, CardHeader, CardTitle } from '@seta/shared-ui';
import { AlertTriangle, Ban, CheckCircle2, RotateCcw } from 'lucide-react';
import type { ComponentProps } from 'react';
import type { QaDecision, QaFinding, QaRisk, RevisionInstruction } from '../types.ts';

const riskVariant = {
  HIGH: 'destructive',
  MEDIUM: 'warning',
  LOW: 'success',
} as const satisfies Record<QaRisk, ComponentProps<typeof Badge>['variant']>;

const decisionVariant = {
  PASS: 'success',
  PASS_WITH_WARNINGS: 'warning',
  REVISE_REQUIRED: 'warning',
  BLOCKED: 'destructive',
} as const satisfies Record<QaDecision, ComponentProps<typeof Badge>['variant']>;

function FindingList({ findings, emptyLabel }: { findings: QaFinding[]; emptyLabel: string }) {
  if (findings.length === 0) {
    return <div className="text-body-sm text-ink-subtle">{emptyLabel}</div>;
  }
  return (
    <ul className="space-y-2">
      {findings.map((finding) => (
        <li
          key={`${finding.type}-${finding.relatedInitiativeId ?? finding.skill ?? finding.message}`}
          className="rounded-md border border-hairline bg-canvas p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={riskVariant[finding.severity]}>{finding.severity}</Badge>
            <span className="font-medium text-ink">{finding.type}</span>
            {finding.relatedInitiativeId && (
              <span className="font-mono text-caption text-ink-subtle">
                {finding.relatedInitiativeId}
              </span>
            )}
          </div>
          <p className="mt-2 text-body-sm text-ink-subtle">{finding.message}</p>
        </li>
      ))}
    </ul>
  );
}

export function QaFindingsPanel({
  findings,
  score,
  riskLevel,
  riskReason,
  qaDecision,
  blockingIssues,
  revisionInstructions,
}: {
  findings: QaFinding[];
  score: number;
  riskLevel: QaRisk;
  riskReason: string;
  qaDecision: QaDecision;
  blockingIssues: QaFinding[];
  revisionInstructions: RevisionInstruction[];
}) {
  const blockingKeys = new Set(
    blockingIssues.map((finding) => `${finding.type}:${finding.relatedInitiativeId ?? ''}`),
  );
  const warnings = findings.filter(
    (finding) => !blockingKeys.has(`${finding.type}:${finding.relatedInitiativeId ?? ''}`),
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 gap-3">
        <CardTitle>Agent 2 Quality Gate</CardTitle>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Badge variant={decisionVariant[qaDecision]}>{qaDecision}</Badge>
          <Badge variant={riskVariant[riskLevel]}>
            QA score {score}/100 · {riskLevel} risk
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-body-sm text-ink-subtle">{riskReason}</p>

        <section aria-labelledby="blocking-issues-title">
          <div className="mb-2 flex items-center gap-2">
            {blockingIssues.length > 0 ? (
              <Ban className="size-4 text-ink-subtle" aria-hidden />
            ) : (
              <CheckCircle2 className="size-4 text-ink-subtle" aria-hidden />
            )}
            <h3 id="blocking-issues-title" className="font-medium text-ink">
              Blocking Issues ({blockingIssues.length})
            </h3>
          </div>
          <FindingList findings={blockingIssues} emptyLabel="No blocking issues." />
        </section>

        <section aria-labelledby="qa-warnings-title">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="size-4 text-ink-subtle" aria-hidden />
            <h3 id="qa-warnings-title" className="font-medium text-ink">
              Warnings ({warnings.length})
            </h3>
          </div>
          <FindingList findings={warnings} emptyLabel="No warnings for this draft." />
        </section>

        {revisionInstructions.length > 0 && (
          <section aria-labelledby="revision-instructions-title">
            <div className="mb-2 flex items-center gap-2">
              <RotateCcw className="size-4 text-ink-subtle" aria-hidden />
              <h3 id="revision-instructions-title" className="font-medium text-ink">
                Agent 1 Revision Instructions ({revisionInstructions.length})
              </h3>
            </div>
            <ul className="space-y-2">
              {revisionInstructions.map((instruction) => (
                <li
                  key={`${instruction.initiativeId}-${instruction.issueType}-${instruction.action}-${instruction.message}`}
                  className="rounded-md border border-hairline bg-surface-1 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{instruction.action}</Badge>
                    <span className="font-mono text-caption text-ink-subtle">
                      {instruction.initiativeId}
                    </span>
                    <span className="text-caption text-ink-subtle">{instruction.issueType}</span>
                  </div>
                  <p className="mt-2 text-body-sm text-ink">{instruction.message}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
