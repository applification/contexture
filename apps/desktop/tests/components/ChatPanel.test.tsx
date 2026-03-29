import { useOntologyStore } from '@renderer/store/ontology';
import { useUIStore } from '@renderer/store/ui';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock streamdown before importing ChatPanel
vi.mock('streamdown', () => ({
  Streamdown: ({ children }: { children: string }) => (
    <span data-testid="streamdown">{children}</span>
  ),
}));
vi.mock('@streamdown/code', () => ({ code: {} }));

const { ChatPanel } = await import('@renderer/components/chat/ChatPanel');

function resetStores() {
  useUIStore.setState({
    selectedNodeId: null,
    selectedEdgeId: null,
    chatDraft: '',
    pendingChatMessage: null,
    sidebarTab: 'chat',
  });
  useOntologyStore.getState().reset();
}

describe('ChatPanel', () => {
  beforeEach(resetStores);
  afterEach(cleanup);

  it('renders Claude header', () => {
    render(<ChatPanel />);
    expect(screen.getByText('Claude')).toBeInTheDocument();
  });

  it('shows not connected state when CLI not detected', () => {
    render(<ChatPanel />);
    expect(screen.getByText('Not connected')).toBeInTheDocument();
  });

  it('renders textarea input', () => {
    render(<ChatPanel />);
    const textarea = screen.getByPlaceholderText('Configure auth first...');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toBeDisabled();
  });

  it('shows model and effort selectors', () => {
    render(<ChatPanel />);
    expect(screen.getAllByText('Sonnet').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Auto').length).toBeGreaterThan(0);
  });

  it('shows selection context badge when node selected', () => {
    useOntologyStore.getState().addClass('http://ex/Person', { label: 'Person' });
    useUIStore.setState({ selectedNodeId: 'http://ex/Person' });
    render(<ChatPanel />);
    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.getByText('◆')).toBeInTheDocument();
  });

  it('shows selection context badge when edge selected', () => {
    useOntologyStore.getState().addObjectProperty('http://ex/worksAt', {
      label: 'works at',
      domain: ['http://ex/A'],
      range: ['http://ex/B'],
    });
    useUIStore.setState({ selectedEdgeId: 'http://ex/worksAt' });
    render(<ChatPanel />);
    expect(screen.getByText('works at')).toBeInTheDocument();
    expect(screen.getByText('→')).toBeInTheDocument();
  });
});
