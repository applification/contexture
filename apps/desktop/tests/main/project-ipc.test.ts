import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { deleteProjectDirectory } from '@main/ipc/project';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

describe('deleteProjectDirectory', () => {
  it('deletes a nested project directory', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'contexture-delete-'));
    const target = join(parent, 'project');
    await mkdir(target);
    await writeFile(join(target, 'package.json'), '{}\n', 'utf8');

    await deleteProjectDirectory(target);
    await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects protected or ambiguous targets', async () => {
    await expect(deleteProjectDirectory(homedir())).rejects.toThrow(/home directory/);
    await expect(deleteProjectDirectory('relative/project')).rejects.toThrow(/absolute/);
  });

  it('rejects file targets', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'contexture-delete-file-'));
    const target = join(parent, 'not-a-directory');
    await writeFile(target, 'keep me\n', 'utf8');

    await expect(deleteProjectDirectory(target)).rejects.toThrow(/directory/);
    await expect(readFile(target, 'utf8')).resolves.toBe('keep me\n');
  });
});
