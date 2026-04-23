import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONTEXTURE_OPEN_FILTER, CONTEXTURE_SAVE_FILTER, handleSave } from '@main/ipc/file';
import type { Schema } from '@renderer/model/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

describe('handleSave', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'contexture-ipc-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes all 5 files to disk when given an IR path', async () => {
    const irPath = join(dir, 'garden.contexture.json');
    const schema: Schema = {
      version: '1',
      types: [{ kind: 'object', name: 'Plot', fields: [] }],
    };
    await handleSave({
      irPath,
      schema,
      layout: { version: '1', positions: {} },
      chat: { version: '1', messages: [] },
    });
    expect(readFileSync(irPath, 'utf-8')).toContain('"Plot"');
    expect(readFileSync(join(dir, 'garden.contexture.layout.json'), 'utf-8')).toContain('"1"');
    expect(readFileSync(join(dir, 'garden.contexture.chat.json'), 'utf-8')).toContain('"1"');
    expect(readFileSync(join(dir, 'garden.schema.ts'), 'utf-8')).toMatch(/Do not edit/);
    expect(readFileSync(join(dir, 'garden.schema.json'), 'utf-8')).toMatch(/Do not edit/);
  });
});
