import type { QaFinding, QaRiskLevel } from './qa-types.ts';
import type { QaInput } from './qa-validate-roadmap.ts';

interface QaToolRunState {
  input: QaInput;
  toolCallCounts: Map<string, number>;
  toolResults: Map<string, unknown>;
  finalFindings?: QaFinding[];
  scoreCall?: {
    findings: QaFinding[];
    result: { score: number; riskLevel: QaRiskLevel; reason: string };
  };
}

const runs = new Map<string, QaToolRunState>();

export function createQaToolRun(input: QaInput): string {
  const runId = globalThis.crypto?.randomUUID?.() ?? `qa-${Date.now()}-${Math.random()}`;
  runs.set(runId, { input, toolCallCounts: new Map(), toolResults: new Map() });
  return runId;
}

export function getQaToolRun(runId: string): QaInput {
  const run = runs.get(runId);
  if (!run) throw new Error(`QA tool run not found or expired: ${runId}`);
  return run.input;
}

export function markQaToolCalled(runId: string, toolId: string): void {
  const run = runs.get(runId);
  if (!run) throw new Error(`QA tool run not found or expired: ${runId}`);
  run.toolCallCounts.set(toolId, (run.toolCallCounts.get(toolId) ?? 0) + 1);
}

export function recordQaToolResult(runId: string, toolId: string, result: unknown): void {
  const run = runs.get(runId);
  if (!run) throw new Error(`QA tool run not found or expired: ${runId}`);
  run.toolResults.set(toolId, result);
}

export function getQaToolResults(runId: string): ReadonlyMap<string, unknown> {
  const run = runs.get(runId);
  if (!run) throw new Error(`QA tool run not found or expired: ${runId}`);
  return run.toolResults;
}

export function recordQaFinalFindings(runId: string, findings: QaFinding[]): void {
  const run = runs.get(runId);
  if (!run) throw new Error(`QA tool run not found or expired: ${runId}`);
  run.finalFindings = findings;
}

export function getQaFinalFindings(runId: string): QaFinding[] {
  const findings = runs.get(runId)?.finalFindings;
  if (!findings) throw new Error('QA semantic synthesis did not produce final findings');
  return findings;
}

export function assertQaToolsCalled(runId: string, requiredToolIds: readonly string[]): void {
  const run = runs.get(runId);
  if (!run) throw new Error(`QA tool run not found or expired: ${runId}`);
  const missing = requiredToolIds.filter((toolId) => !run.toolCallCounts.has(toolId));
  if (missing.length > 0) throw new Error(`QA agent skipped required tools: ${missing.join(', ')}`);
}

export function missingQaTools(runId: string, requiredToolIds: readonly string[]): string[] {
  const run = runs.get(runId);
  if (!run) throw new Error(`QA tool run not found or expired: ${runId}`);
  return requiredToolIds.filter((toolId) => !run.toolCallCounts.has(toolId));
}

export function recordQaScoreCall(
  runId: string,
  findings: QaFinding[],
  result: { score: number; riskLevel: QaRiskLevel; reason: string },
): void {
  const run = runs.get(runId);
  if (!run) throw new Error(`QA tool run not found or expired: ${runId}`);
  run.scoreCall = { findings, result };
}

export function getQaScoreCall(runId: string): NonNullable<QaToolRunState['scoreCall']> {
  const scoreCall = runs.get(runId)?.scoreCall;
  if (!scoreCall) throw new Error('QA agent did not produce a score-tool result');
  return scoreCall;
}

export function assertQaScoreMatches(
  runId: string,
  output: {
    findings: QaFinding[];
    score: number;
    riskLevel: QaRiskLevel;
    riskReason: string;
  },
): void {
  const scoreCall = runs.get(runId)?.scoreCall;
  if (!scoreCall) throw new Error('QA agent did not produce a score-tool result');
  if (JSON.stringify(scoreCall.findings) !== JSON.stringify(output.findings)) {
    throw new Error('QA agent final findings differ from the findings passed to the score tool');
  }
  if (
    scoreCall.result.score !== output.score ||
    scoreCall.result.riskLevel !== output.riskLevel ||
    scoreCall.result.reason !== output.riskReason
  ) {
    throw new Error('QA agent did not use the score-tool result verbatim');
  }
}

export function deleteQaToolRun(runId: string): void {
  runs.delete(runId);
}
