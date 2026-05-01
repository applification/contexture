import { openInEditor } from '@main/ipc/shell';
import { shell } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
  ipcMain: { handle: vi.fn() },
}));

describe('openInEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the path in a new VS Code window via the CLI runner', async () => {
    const runCli = vi.fn(async () => undefined);
    await openInEditor('/projects/my-app', runCli);
    expect(runCli).toHaveBeenCalledWith(['--new-window', '/projects/my-app']);
  });

  it('does not fall back to shell.openExternal when CLI runner succeeds', async () => {
    const runCli = vi.fn(async () => undefined);
    await openInEditor('/projects/my-app', runCli);
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('falls back to shell.openExternal when the CLI runner throws', async () => {
    const runCli = vi.fn().mockRejectedValue(new Error('ENOENT: code not found'));
    await openInEditor('/projects/my-app', runCli);
    expect(shell.openExternal).toHaveBeenCalledWith('vscode://file/projects/my-app');
  });

  it('passes the path verbatim to the CLI runner', async () => {
    const runCli = vi.fn(async () => undefined);
    await openInEditor('/path/with spaces/project', runCli);
    expect(runCli).toHaveBeenCalledWith(['--new-window', '/path/with spaces/project']);
  });
});
