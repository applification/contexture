import { openInEditor } from '@main/ipc/shell';
import { describe, expect, it, vi } from 'vitest';

describe('openInEditor', () => {
  it('opens the path in a new VS Code window via the CLI runner', async () => {
    const runCli = vi.fn(async () => undefined);
    await openInEditor('/projects/my-app', runCli);
    expect(runCli).toHaveBeenCalledWith(['--new-window', '/projects/my-app']);
  });
});
