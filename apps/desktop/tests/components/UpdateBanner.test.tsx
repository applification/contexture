import { UpdateBanner } from '@renderer/components/UpdateBanner';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('UpdateBanner', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(window.contexture.update.getState).mockResolvedValue({ status: 'idle' });
    vi.mocked(window.contexture.update.onState).mockReturnValue(() => {});
  });

  it('returns null for idle status', async () => {
    const { container } = render(<UpdateBanner />);
    await act(async () => {});
    expect(container.innerHTML).toBe('');
  });

  it('returns null for checking status', async () => {
    vi.mocked(window.contexture.update.getState).mockResolvedValue({ status: 'checking' });
    const { container } = render(<UpdateBanner />);
    await act(async () => {});
    expect(container.innerHTML).toBe('');
  });

  it('shows available update with download button', async () => {
    vi.mocked(window.contexture.update.getState).mockResolvedValue({
      status: 'available',
      version: '1.2.3',
    });
    render(<UpdateBanner />);
    await act(async () => {});
    expect(screen.getByText(/Update available: v1.2.3/)).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  it('shows downloading state with progress', async () => {
    vi.mocked(window.contexture.update.getState).mockResolvedValue({
      status: 'downloading',
      progress: 45,
    });
    render(<UpdateBanner />);
    await act(async () => {});
    expect(screen.getByText('Downloading update…')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('shows ready state with install button', async () => {
    vi.mocked(window.contexture.update.getState).mockResolvedValue({
      status: 'ready',
      version: '1.2.3',
    });
    render(<UpdateBanner />);
    await act(async () => {});
    expect(screen.getByText(/v1.2.3 ready to install/)).toBeInTheDocument();
    expect(screen.getByText('Restart & update')).toBeInTheDocument();
  });

  it('shows error state with retry button', async () => {
    vi.mocked(window.contexture.update.getState).mockResolvedValue({
      status: 'error',
      message: 'Network error',
    });
    render(<UpdateBanner />);
    await act(async () => {});
    expect(screen.getByText(/Update check failed/)).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });
});
