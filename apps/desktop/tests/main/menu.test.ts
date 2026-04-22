import { createMenuTemplate } from '@main/menu';
import { describe, expect, it } from 'vitest';

// Locate a menu item by label path, e.g. ['File', 'Open Contexture File…'].
function findItem(
  template: ReturnType<typeof createMenuTemplate>,
  path: string[],
): { label?: string; accelerator?: string } | undefined {
  let items: readonly unknown[] = template;
  let found: { label?: string; accelerator?: string } | undefined;
  for (const label of path) {
    const next = (items as Array<{ label?: string; submenu?: unknown[] }>).find(
      (it) => it.label === label,
    );
    if (!next) return undefined;
    found = next;
    items = (next.submenu as unknown[]) ?? [];
  }
  return found;
}

describe('app menu', () => {
  const sentMessages: string[] = [];
  const fakeWindow = {
    webContents: { send: (ch: string) => sentMessages.push(ch) },
  } as unknown as Electron.BrowserWindow;

  const template = createMenuTemplate(fakeWindow);

  it('labels the New item "New Contexture File"', () => {
    expect(findItem(template, ['File', 'New Contexture File'])).toBeDefined();
  });

  it('labels the Open item "Open Contexture File…"', () => {
    expect(findItem(template, ['File', 'Open Contexture File…'])).toBeDefined();
  });

  it('labels the Save As item "Save Contexture File As…"', () => {
    expect(findItem(template, ['File', 'Save Contexture File As…'])).toBeDefined();
  });

  it('keeps Save with Cmd+S accelerator', () => {
    const save = findItem(template, ['File', 'Save']);
    expect(save?.accelerator).toBe('CmdOrCtrl+S');
  });
});
