import { Toolbar } from '@renderer/components/toolbar/Toolbar';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const unsub = () => undefined;

function installContexture(overrides: Record<string, unknown> = {}): void {
  (window as unknown as { contexture: unknown }).contexture = {
    schemaAgent: {
      setProvider: vi.fn(async () => ({ ok: true })),
      getStatus: vi.fn(async () => ({ provider: 'codex', readiness: 'not_signed_in' })),
      onStatusChanged: vi.fn(() => unsub),
      startLogin: vi.fn(async () => ({
        id: 'login-1',
        mode: 'chatgpt',
        url: 'https://auth.example.test',
      })),
      logout: vi.fn(async () => undefined),
      ...overrides,
    },
    shell: { openInEditor: vi.fn(async () => undefined) },
  };
}

describe('Toolbar Codex settings', () => {
  beforeEach(() => {
    localStorage.clear();
    installContexture();
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows Codex readiness and starts ChatGPT login', async () => {
    installContexture({
      getStatus: vi.fn(async () => ({ provider: 'codex', readiness: 'authenticated_chatgpt' })),
    });
    render(<Toolbar />);

    fireEvent.click(screen.getByTitle('Codex settings'));

    await waitFor(() => {
      expect(screen.getByText('Codex authenticated with ChatGPT.')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'ChatGPT' }));

    await waitFor(() => {
      expect(window.contexture.schemaAgent.startLogin).toHaveBeenCalledWith({ mode: 'chatgpt' });
      expect(window.open).toHaveBeenCalledWith(
        'https://auth.example.test',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  it('submits Codex API-key login', async () => {
    render(<Toolbar />);

    fireEvent.click(screen.getByTitle('Codex settings'));
    const input = await screen.findByPlaceholderText('OPENAI_API_KEY');
    fireEvent.change(input, { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use API key' }));

    await waitFor(() => {
      expect(window.contexture.schemaAgent.startLogin).toHaveBeenCalledWith({
        mode: 'api-key',
        apiKey: 'sk-test',
      });
    });
  });

  it('refreshes Codex status when the provider popover opens', async () => {
    const getStatus = vi.fn(async () => ({
      provider: 'codex',
      readiness: 'authenticated_chatgpt',
    }));
    installContexture({ getStatus });
    render(<Toolbar />);

    fireEvent.click(screen.getByTitle('Codex settings'));

    await waitFor(() => {
      expect(screen.getByText('Codex authenticated with ChatGPT.')).toBeInTheDocument();
    });
    expect(getStatus).toHaveBeenCalled();
  });

  it('switches to Claude and starts CLI login through schema-agent', async () => {
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({ provider: 'codex', readiness: 'not_signed_in' })
      .mockResolvedValue({ provider: 'claude', readiness: 'authenticated_cli' });
    installContexture({ getStatus });
    render(<Toolbar />);

    fireEvent.click(screen.getByTitle('Codex settings'));
    fireEvent.click(await screen.findByRole('button', { name: 'Claude' }));

    await waitFor(() => {
      expect(screen.getByText('Claude CLI session available.')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Claude CLI' }));

    await waitFor(() => {
      expect(window.contexture.schemaAgent.setProvider).toHaveBeenCalledWith('claude');
      expect(window.contexture.schemaAgent.startLogin).toHaveBeenCalledWith({
        mode: 'cli-session',
      });
    });
  });
});
