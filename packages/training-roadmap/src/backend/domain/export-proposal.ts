import type { RoadmapExportProposal, RoadmapResult } from '../../types.ts';

export function buildExportProposal(result: RoadmapResult): RoadmapExportProposal {
  if (result.qaDecision === 'BLOCKED') {
    throw new Error('Cannot export: QA decision is BLOCKED.');
  }
  if (result.qaDecision === 'REVISE_REQUIRED') {
    throw new Error('Cannot export: revision is required before approval.');
  }
  if (result.qaDecision === 'PASS_WITH_WARNINGS' && result.reviewStatus !== 'approved_with_risks') {
    throw new Error('Cannot export: warnings require explicit approve-with-risks.');
  }
  if (result.qaDecision === 'PASS' && result.reviewStatus !== 'approved') {
    throw new Error('Cannot export: human approval required.');
  }
  if (result.qaDecision === 'PASS_WITH_WARNINGS' && !result.approvalNotes?.trim()) {
    throw new Error('Cannot export: approve-with-risks requires an approval note.');
  }
  if (!result.approvalToken?.trim()) {
    throw new Error('Cannot export: human approval token required.');
  }

  return {
    runId: result.runId,
    exportedAt: new Date().toISOString(),
    approvalToken: result.approvalToken,
    qaDecision: result.qaDecision,
    riskLevel: result.riskLevel,
    qaFindings: result.qaFindings,
    approvalNotes: result.approvalNotes ?? null,
    approvedBy: result.approvedBy ?? null,
    approvedAt: result.approvedAt ?? null,
    revisionCount: result.revisionCount,
    result,
  };
}
