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

  it('sends the user prompt to Agent 1 before requesting Agent 2 QA', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ runId: 'agent-1-run' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            runId: 'agent-1-run',
            reviewStatus: 'pending',
            executionLog: ['Loaded roadmap_output_agent.json.'],
            initiatives: [],
            qaFindings: [],
            qaScore: 100,
            riskLevel: 'LOW',
            riskReason: 'No findings.',
            evidencePack: {},
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
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/training-roadmap/run',
      expect.objectContaining({ body: JSON.stringify({ userPrompt: 'React testing in Q3' }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/training-roadmap/qa',
      expect.objectContaining({ method: 'POST' }),
    );
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

  it('uses the stable bundled flow when the backend is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const user = userEvent.setup();
    render(<TrainingRoadmapDemoPage />);

    await user.click(screen.getByRole('button', { name: 'Generate Roadmap' }));

    expect(await screen.findByText('Stable demo fallback')).toBeInTheDocument();
    expect(screen.getByText('Kubernetes Enablement')).toBeInTheDocument();
    expect(screen.getByText('QA score 86/100 · MEDIUM risk')).toBeInTheDocument();
    expect(screen.getByText('TRAINER_GAP (3)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('DEMO-APPROVAL-demo-member1-snapshot')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
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
