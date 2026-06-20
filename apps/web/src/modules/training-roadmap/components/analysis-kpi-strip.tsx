import type { TrainingAnalysisSnapshot } from '../types.ts';

const cards = [
  { key: 'employeesAnalyzed', label: 'Employees analyzed' },
  { key: 'employeesWithTargetGaps', label: 'Employees with target gaps' },
  { key: 'uniqueTargetGapSkills', label: 'Target-gap skills' },
  { key: 'initiativesScored', label: 'Initiatives scored' },
  { key: 'uncoveredSkills', label: 'Trainer coverage gaps' },
] as const;

export function AnalysisKpiStrip({ snapshot }: { snapshot: TrainingAnalysisSnapshot }) {
  const gapRate = Math.round(
    (snapshot.metrics.employeesWithTargetGaps / snapshot.metrics.employeesAnalyzed) * 100,
  );

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
      data-testid="analysis-kpis"
    >
      {cards.map(({ key, label }) => (
        <div key={key} className="rounded-lg border border-hairline bg-canvas px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-ink">
              {snapshot.metrics[key]}
            </span>
            {key === 'employeesWithTargetGaps' && (
              <span className="text-xs text-ink-subtle">{gapRate}%</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
