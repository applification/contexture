import { DEFAULT_LAYOUT, loadLayout, renameLayoutKey, saveLayout } from '@renderer/model/layout';
import { describe, expect, it } from 'vitest';

describe('layout sidecar', () => {
  it('round-trips positions, groups, and viewport through save/load', () => {
    const layout = {
      version: '1' as const,
      positions: {
        Allotment: { x: 10, y: 20 },
        Plot: { x: 100, y: 200 },
      },
      groups: [
        { id: 'g1', label: 'Planting', x: 0, y: 0, width: 400, height: 300, members: ['Plot'] },
      ],
      viewport: { x: 5, y: -5, zoom: 1.25 },
    };

    const raw = saveLayout(layout);
    const { layout: round, warnings } = loadLayout(raw);

    expect(round).toEqual(layout);
    expect(warnings).toEqual([]);
  });

  it('discards unknown-version files and returns defaults with a warning', () => {
    const raw = JSON.stringify({ version: '99', positions: { X: { x: 1, y: 2 } } });
    const { layout, warnings } = loadLayout(raw);
    expect(layout).toEqual(DEFAULT_LAYOUT);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/99/);
    expect(warnings[0]).toMatch(/discard/i);
  });

  it('discards malformed JSON without throwing', () => {
    const { layout, warnings } = loadLayout('{ not json');
    expect(layout).toEqual(DEFAULT_LAYOUT);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/invalid json/i);
  });

  it('renameLayoutKey moves position + group members under the new type name', () => {
    const before = {
      version: '1' as const,
      positions: { OldName: { x: 1, y: 2 }, Other: { x: 3, y: 4 } },
      groups: [
        { id: 'g', label: 'g', x: 0, y: 0, width: 10, height: 10, members: ['OldName', 'Other'] },
      ],
    };
    const after = renameLayoutKey(before, 'OldName', 'NewName');
    expect(after.positions).toEqual({ NewName: { x: 1, y: 2 }, Other: { x: 3, y: 4 } });
    expect(after.groups?.[0].members).toEqual(['NewName', 'Other']);
    // Original not mutated.
    expect(before.positions.OldName).toEqual({ x: 1, y: 2 });
  });

  it('renameLayoutKey is a no-op when the old name is absent', () => {
    const before = {
      version: '1' as const,
      positions: { A: { x: 0, y: 0 } },
    };
    const after = renameLayoutKey(before, 'Missing', 'Whatever');
    expect(after).toEqual(before);
  });
});
