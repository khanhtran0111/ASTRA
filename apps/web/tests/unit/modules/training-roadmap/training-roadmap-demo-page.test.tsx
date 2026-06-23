import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrainingRoadmapDemoPage } from '../../../../src/modules/training-roadmap/pages/training-roadmap-demo-page';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TrainingRoadmapDemoPage', () => {
  it('renders the deterministic Member 1 dataset snapshot', () => {
    render(<TrainingRoadmapDemoPage />);

    expect(screen.getByLabelText('Constraints Prompt')).toBeInTheDocument();
    expect(screen.getByText('Dataset readiness')).toBeInTheDocument();
    expect(screen.getByText('5 / 5 ready')).toBeInTheDocument();
    expect(screen.getByText('DS01')).toBeInTheDocument();
    expect(screen.getByText('205 employee profiles normalized')).toBeInTheDocument();
    expect(
      screen.getByText('119 active responses; 22 older responses retained for audit'),
    ).toBeInTheDocument();
  });

  it('sends the user prompt through the canonical generation and QA endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          runId: 'agent-1-run',
          reviewStatus: 'pending_review',
          executionLog: ['Loaded roadmap_output_agent.json.'],
          initiatives: [],
          draftInitiatives: [
            {
              id: 'draft-1',
              topic: 'React testing',
              priority: 'P1',
              score: 90,
              quarter: 'Q3 2026',
              targetTrainees: ['EMP-001'],
              trainerName: 'TRN-001',
              format: 'internal',
              estimatedHours: 16,
              evidence: [],
              riskFlags: [],
            },
          ],
          qaDecision: 'PASS',
          qaFindings: [],
          blockingIssues: [],
          revisionInstructions: [],
          approvalRequirement: 'HUMAN_APPROVAL',
          qaSummary: 'QA passed.',
          qaScore: 100,
          riskLevel: 'LOW',
          riskReason: 'No findings.',
          revisionCount: 0,
          evidencePack: {},
          reviewPack: {
            request: { userPrompt: 'React testing in Q3' },
            generatedAt: '2026-06-21T00:00:00.000Z',
            initiativeCount: 0,
            semanticSummary: [],
            findings: [],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<TrainingRoadmapDemoPage />);

    await user.type(screen.getByLabelText('Constraints Prompt'), 'React testing in Q3');
    await user.click(screen.getByRole('button', { name: 'Generate Roadmap' }));

    expect(await screen.findByText('API connected')).toBeInTheDocument();
    expect(screen.getByText('Review Pack')).toBeInTheDocument();
    expect(screen.getByText('React testing')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/training-roadmap/run',
      expect.objectContaining({ body: JSON.stringify({ userPrompt: 'React testing in Q3' }) }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('generates on Enter and keeps Shift+Enter for a new line', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Stopped after submit'));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<TrainingRoadmapDemoPage />);
    const prompt = screen.getByLabelText('Constraints Prompt');

    await user.type(prompt, 'Frontend roadmap');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(fetchMock).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows an animated workflow status while Agent 1 and Agent 2 are running', async () => {
    let resolveRun: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveRun = resolve;
          }),
      ),
    );
    const user = userEvent.setup();
    render(<TrainingRoadmapDemoPage />);

    await user.type(screen.getByLabelText('Constraints Prompt'), 'Kubernetes roadmap{enter}');

    expect(screen.getByRole('status', { name: 'Generating roadmap' })).toBeInTheDocument();
    expect(screen.getByText('Agent workflow in progress')).toBeInTheDocument();

    resolveRun?.(
      new Response(JSON.stringify({ error: 'Stopped' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('sends revision feedback through the same canonical pipeline before reopening review', async () => {
    const roadmapResult = {
      runId: 'agent-1-run',
      reviewStatus: 'pending_review',
      executionLog: ['Paused at Human Review Gate.'],
      initiatives: [],
      draftInitiatives: [],
      qaDecision: 'PASS',
      qaFindings: [],
      blockingIssues: [],
      revisionInstructions: [],
      approvalRequirement: 'HUMAN_APPROVAL',
      qaSummary: 'QA passed.',
      qaScore: 100,
      riskLevel: 'LOW',
      riskReason: 'No findings.',
      revisionCount: 0,
      evidencePack: {},
      reviewPack: {
        request: { userPrompt: 'React testing in Q3' },
        generatedAt: '2026-06-21T00:00:00.000Z',
        initiativeCount: 0,
        semanticSummary: [],
        findings: [],
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(roadmapResult), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...roadmapResult,
            executionLog: ['Applied human feedback.', 'Paused at Human Review Gate.'],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<TrainingRoadmapDemoPage />);

    await user.click(screen.getByRole('button', { name: 'Generate Roadmap' }));
    await screen.findByText('Review Pack');
    await user.click(screen.getByRole('button', { name: 'Request Revision' }));
    await user.type(
      screen.getByLabelText('Revision feedback'),
      'Move React testing to Q3 and shorten the workshop.',
    );
    await user.click(screen.getByRole('button', { name: 'Submit & Regenerate' }));

    expect(await screen.findByText('Applied human feedback.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/training-roadmap/feedback',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          runId: 'agent-1-run',
          feedback: 'Move React testing to Q3 and shorten the workshop.',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Pending Review')).toBeInTheDocument();
  });

  it('shows skill gaps, priorities, and trainer readiness without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<TrainingRoadmapDemoPage />);

    await user.click(screen.getByRole('tab', { name: 'Analysis' }));

    expect(screen.getByText('Declared skill gaps')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Containerization' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Kubernetes' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '98' })).toBeInTheDocument();
    expect(screen.getByText('Skills without coverage')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces backend failures and never substitutes an approvable demo roadmap', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const user = userEvent.setup();
    render(<TrainingRoadmapDemoPage />);

    await user.click(screen.getByRole('button', { name: 'Generate Roadmap' }));

    expect(await screen.findByText('Failed to fetch')).toBeInTheDocument();
    expect(screen.queryByText('Stable demo fallback')).not.toBeInTheDocument();
    expect(screen.queryByText('Kubernetes Enablement')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('keeps the Agent 1 draft visible when QA returns no final initiatives', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            runId: 'agent-1-run',
            reviewStatus: 'pending_review',
            executionLog: ['Loaded roadmap_output_agent.json.'],
            initiatives: [],
            draftInitiatives: [
              {
                id: 'draft-1',
                topic: 'Security Testing',
                priority: 'P1',
                score: 92,
                quarter: 'Q3 2026',
                targetTrainees: ['EMP-001'],
                trainerName: 'TRN-001',
                format: 'internal',
                estimatedHours: 24,
                evidence: [],
                riskFlags: [],
              },
            ],
            qaDecision: 'REVISE_REQUIRED',
            qaFindings: [],
            blockingIssues: [],
            revisionInstructions: [],
            approvalRequirement: 'REVISION_REQUIRED',
            qaSummary: 'Needs revision.',
            qaScore: 62,
            riskLevel: 'MEDIUM',
            riskReason: 'Scope review still pending.',
            revisionCount: 0,
            evidencePack: {},
            reviewPack: {
              request: { userPrompt: 'Security testing roadmap' },
              generatedAt: '2026-06-21T00:00:00.000Z',
              initiativeCount: 0,
              semanticSummary: [],
              findings: [],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const user = userEvent.setup();
    render(<TrainingRoadmapDemoPage />);

    await user.click(screen.getByRole('button', { name: 'Generate Roadmap' }));

    expect(await screen.findByText('Security Testing')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Showing the original Agent 1 draft because QA feedback did not keep any final initiatives visible yet.',
      ),
    ).toBeInTheDocument();
  });

  it('surfaces contract errors instead of hiding them behind the demo fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Roadmap contract is invalid' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const user = userEvent.setup();
    render(<TrainingRoadmapDemoPage />);

    await user.click(screen.getByRole('button', { name: 'Generate Roadmap' }));

    expect(await screen.findByText('Roadmap contract is invalid')).toBeInTheDocument();
    expect(screen.queryByText('Stable demo fallback')).not.toBeInTheDocument();
  });
});
