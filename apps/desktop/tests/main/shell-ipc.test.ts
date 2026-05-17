import { assertSafeShellPath, openInEditor, registerShellIpc } from '@main/ipc/shell';
import { ipcMain, shell } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  handle: vi.fn(),
  openExternal: vi.fn().mockResolvedValue(undefined),
  showItemInFolder: vi.fn(),
}));

vi.mock('electron', () => ({
  shell: {
    openExternal: electronMock.openExternal,
    showItemInFolder: electronMock.showItemInFolder,
  },
  ipcMain: { handle: electronMock.handle },
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

  it('encodes the fallback VS Code URL', async () => {
    const runCli = vi.fn().mockRejectedValue(new Error('ENOENT: code not found'));
    await openInEditor('/path/with spaces/project', runCli);
    expect(shell.openExternal).toHaveBeenCalledWith('vscode://file/path/with%20spaces/project');
  });

  it('rejects empty, relative, and null-byte paths before invoking shell surfaces', async () => {
    const runCli = vi.fn(async () => undefined);

    await expect(openInEditor('', runCli)).rejects.toThrow('non-empty absolute paths');
    await expect(openInEditor('relative/project', runCli)).rejects.toThrow(
      'non-empty absolute paths',
    );
    await expect(openInEditor('/tmp/project\0suffix', runCli)).rejects.toThrow(
      'non-empty absolute paths',
    );

    expect(runCli).not.toHaveBeenCalled();
    expect(shell.openExternal).not.toHaveBeenCalled();
  });
});

describe('assertSafeShellPath', () => {
  it('accepts non-empty absolute paths', () => {
    expect(assertSafeShellPath('/projects/my-app')).toBe('/projects/my-app');
  });

  it('rejects non-string input', () => {
    expect(() => assertSafeShellPath(null)).toThrow('non-empty absolute paths');
  });
});

describe('registerShellIpc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates reveal paths before calling the OS file manager', () => {
    registerShellIpc();
    const revealHandler = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => {
      return channel === 'shell:reveal';
    })?.[1];

    expect(revealHandler).toBeDefined();
    expect(() => revealHandler?.({}, 'relative/project')).toThrow('non-empty absolute paths');
    expect(shell.showItemInFolder).not.toHaveBeenCalled();
  });

  it('reveals validated absolute paths', () => {
    registerShellIpc();
    const revealHandler = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => {
      return channel === 'shell:reveal';
    })?.[1];

    revealHandler?.({}, '/projects/my-app');

    expect(shell.showItemInFolder).toHaveBeenCalledWith('/projects/my-app');
  });
});
