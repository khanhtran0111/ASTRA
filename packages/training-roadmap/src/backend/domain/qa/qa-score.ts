import type { QaFinding, QaRiskLevel } from './qa-types.ts';

const PENALTY = {
  HIGH: 20,
  MEDIUM: 10,
  LOW: 5,
} as const;

export function calculateQaScore(findings: QaFinding[]) {
  const score = Math.max(
    0,
    100 - findings.reduce((total, finding) => total + PENALTY[finding.severity], 0),
  );
  const riskLevel: QaRiskLevel = score >= 90 ? 'LOW' : score >= 70 ? 'MEDIUM' : 'HIGH';
  const counts = findings.reduce(
    (result, finding) => {
      result[finding.severity] += 1;
      return result;
    },
    { HIGH: 0, MEDIUM: 0, LOW: 0 },
  );
  const reason = `${counts.HIGH} HIGH, ${counts.MEDIUM} MEDIUM, and ${counts.LOW} LOW findings produced score ${score}/100.`;

  return { score, riskLevel, reason };
}
