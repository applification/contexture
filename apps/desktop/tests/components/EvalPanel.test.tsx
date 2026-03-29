import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useUIStore } from '@renderer/store/ui';
import { useOntologyStore } from '@renderer/store/ontology';
import { useEvalStore } from '@renderer/store/eval';

// Mock streamdown before importing EvalPanel
vi.mock('streamdown', () => ({
  Streamdown: ({ children }: { children: string }) => (
    <span data-testid="streamdown">{children}</span>
  ),
}));
vi.mock('@streamdown/code', () => ({ code: {} }));

const { EvalPanel } = await import('@renderer/components/eval/EvalPanel');

function resetStores() {
  useUIStore.setState({
    chatDraft: '',
    sidebarTab: 'eval',
    pendingChatMessage: null,
  });
  useOntologyStore.getState().reset();
  useEvalStore.setState({
    config: { domain: '', intendedUse: '', model: 'claude-sonnet-4-6', effort: 'auto' },
    status: 'idle',
    streamText: '',
    report: null,
    error: null,
    selectedSuggestions: [],
    completedSuggestions: [],
    improvementItems: [],
    improvementStatus: 'idle',
  });
}

describe('EvalPanel', () => {
  beforeEach(resetStores);
  afterEach(cleanup);

  it('renders config form', () => {
    render(<EvalPanel />);
    expect(screen.getByPlaceholderText('e.g. Clinical trials in oncology')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('e.g. Reasoning system for drug interactions'),
    ).toBeInTheDocument();
  });

  it('shows domain required hint when empty', () => {
    render(<EvalPanel />);
    expect(screen.getByText('Enter a domain to enable evaluation.')).toBeInTheDocument();
  });

  it('shows ontology required hint when domain set but no classes', () => {
    useEvalStore.getState().setConfig({ domain: 'Healthcare' });
    render(<EvalPanel />);
    expect(screen.getByText('Open or create an ontology first.')).toBeInTheDocument();
  });

  it('disables Run Eval when domain is empty', () => {
    render(<EvalPanel />);
    expect(screen.getByText('Run Eval')).toBeInTheDocument();
    const btn = screen.getByText('Run Eval').closest('button')!;
    expect(btn).toBeDisabled();
  });

  it('enables Run Eval when domain and ontology present', () => {
    useEvalStore.getState().setConfig({ domain: 'Healthcare' });
    useOntologyStore.getState().addClass('http://ex/A');
    render(<EvalPanel />);
    const btn = screen.getByText('Run Eval').closest('button')!;
    expect(btn).not.toBeDisabled();
  });

  it('shows empty state when no evaluation', () => {
    render(<EvalPanel />);
    expect(screen.getByText('No evaluation yet')).toBeInTheDocument();
  });

  it('shows running state', () => {
    useEvalStore.getState().startEval();
    render(<EvalPanel />);
    expect(screen.getByText('Evaluating ontology...')).toBeInTheDocument();
  });

  it('shows abort button during eval', () => {
    useEvalStore.getState().startEval();
    render(<EvalPanel />);
    expect(screen.getByText('Abort')).toBeInTheDocument();
  });

  it('shows stream text during eval', () => {
    useEvalStore.setState({ status: 'running', streamText: 'Analyzing coverage...' });
    render(<EvalPanel />);
    expect(screen.getByText('Analyzing coverage...')).toBeInTheDocument();
  });

  it('shows error state', () => {
    useEvalStore.getState().setError('API rate limited');
    render(<EvalPanel />);
    expect(screen.getByText('API rate limited')).toBeInTheDocument();
  });

  it('shows report with overall score', () => {
    useEvalStore.setState({
      status: 'complete',
      report: {
        score: 85,
        dimensions: [
          { name: 'Coverage', score: 90, findings: ['Good'], suggestions: ['Add more'] },
        ],
        summary: 'Great ontology',
        timestamp: '2026-01-01T00:00:00Z',
      },
    });
    render(<EvalPanel />);
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('out of 100')).toBeInTheDocument();
    expect(screen.getByText('Great ontology')).toBeInTheDocument();
  });

  it('shows dimension cards in report', () => {
    useEvalStore.setState({
      status: 'complete',
      report: {
        score: 75,
        dimensions: [
          { name: 'Coverage', score: 90, findings: ['Good'], suggestions: [] },
          { name: 'Consistency', score: 60, findings: [], suggestions: ['Fix naming'] },
        ],
        summary: 'OK',
        timestamp: '2026-01-01T00:00:00Z',
      },
    });
    render(<EvalPanel />);
    expect(screen.getByText('Coverage')).toBeInTheDocument();
    expect(screen.getByText('Consistency')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
  });

  it('shows improvement footer when suggestions selected', () => {
    useEvalStore.setState({
      status: 'complete',
      report: {
        score: 75,
        dimensions: [{ name: 'Coverage', score: 70, findings: [], suggestions: ['Add X'] }],
        summary: '',
        timestamp: '',
      },
      selectedSuggestions: ['Add X'],
    });
    render(<EvalPanel />);
    expect(screen.getByText(/Run 1 improvement/)).toBeInTheDocument();
  });

  it('updates domain config via input', () => {
    render(<EvalPanel />);
    const input = screen.getByPlaceholderText('e.g. Clinical trials in oncology');
    fireEvent.change(input, { target: { value: 'Finance' } });
    expect(useEvalStore.getState().config.domain).toBe('Finance');
  });

  it('shows model selectors', () => {
    render(<EvalPanel />);
    expect(screen.getByText('Sonnet')).toBeInTheDocument();
  });
});
