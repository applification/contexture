import { CONTEXTURE_OPEN_FILTER, CONTEXTURE_SAVE_FILTER } from '@main/ipc/file';
import { describe, expect, it } from 'vitest';

describe('file IPC open/save filters', () => {
  // Electron's FileFilter.extensions is a bare extension list (no dot,
  // no multi-segment values). The double-extension `.contexture.json`
  // lives on defaultPath; the filter just caps the file browser to
  // `.json`.
  it('restricts Open dialogs to .json with a Contexture-branded label', () => {
    expect(CONTEXTURE_OPEN_FILTER.extensions).toEqual(['json']);
    expect(CONTEXTURE_OPEN_FILTER.name).toMatch(/contexture/i);
  });

  it('restricts Save dialogs to .json', () => {
    expect(CONTEXTURE_SAVE_FILTER.extensions).toEqual(['json']);
  });
});
