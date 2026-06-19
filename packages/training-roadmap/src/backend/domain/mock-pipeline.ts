import type { RoadmapResult } from '../../types.ts';

function createRunId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}`;
}

export async function runMockTrainingRoadmapPipeline(): Promise<RoadmapResult> {
  return {
    runId: createRunId(),
    reviewStatus: 'pending',
    executionLog: [
      'Loaded mock L&D data.',
      'Validated dataset schema.',
      'Normalized skill aliases.',
      'Analyzed skill gaps against project roadmap and BOD goals.',
      'Generated draft roadmap.',
      'QA validation completed.',
      'Paused at Human Review Gate.',
    ],
    initiatives: [
      {
        id: 'TR-001',
        topic: 'TypeScript for Agent Platform Development',
        priority: 'P1',
        score: 24,
        quarter: 'Q3 2026',
        targetTrainees: ['Nguyen Van A', 'Tran Thi B'],
        trainerName: 'Senior TypeScript Trainer',
        format: 'internal',
        estimatedHours: 12,
        evidence: ['BOD01', 'PROJECT-AGENT-PLATFORM', 'DS01'],
      },
      {
        id: 'TR-002',
        topic: 'LLM Evaluation & Guardrails',
        priority: 'P1',
        score: 22,
        quarter: 'Q3 2026',
        targetTrainees: ['Le Van C', 'Pham Thi D'],
        trainerName: null,
        format: 'external',
        estimatedHours: 16,
        evidence: ['BOD01', 'PROJECT-AGENT-PLATFORM', 'DS03'],
        fallbackReason: 'No internal trainer has both matching skill and enough available hours.',
      },
      {
        id: 'TR-003',
        topic: 'Human-in-the-loop Review for AI Workflows',
        priority: 'P2',
        score: 18,
        quarter: 'Q4 2026',
        targetTrainees: ['Hoang Minh E', 'Do Thi F'],
        trainerName: 'Workflow Governance Lead',
        format: 'internal',
        estimatedHours: 8,
        evidence: ['QA02', 'WORKFLOW-HITL', 'BOD03'],
      },
    ],
    qaFindings: [
      {
        id: 'QA-001',
        risk: 'MEDIUM',
        message:
          'LLM Evaluation & Guardrails requires external fallback because no internal trainer is available.',
        relatedInitiativeId: 'TR-002',
      },
      {
        id: 'QA-002',
        risk: 'LOW',
        message: 'Q3 training load stays within the mock team capacity threshold.',
      },
    ],
  };
}
