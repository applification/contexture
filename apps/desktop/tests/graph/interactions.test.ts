/**
 * Pure canvas-interaction helpers — event → op / command.
 */
import {
  handleConnect,
  handleDoubleClick,
  handleKeyDown,
  menuForField,
  menuForType,
  nextTypeName,
} from '@renderer/components/graph/interactions';
import type { Schema } from '@renderer/model/ir';
import { describe, expect, it } from 'vitest';

const empty: Schema = { version: '1', types: [] };

describe('nextTypeName', () => {
  it('returns Type1 on an empty schema', () => {
    expect(nextTypeName(empty)).toBe('Type1');
  });

  it('skips names already in use', () => {
    const schema: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'Type1', fields: [] },
        { kind: 'object', name: 'Type2', fields: [] },
      ],
    };
    expect(nextTypeName(schema)).toBe('Type3');
  });
});

describe('handleDoubleClick', () => {
  it('returns an add_type op for a fresh object type', () => {
    const op = handleDoubleClick(empty);
    expect(op).toEqual({
      kind: 'add_type',
      type: { kind: 'object', name: 'Type1', fields: [] },
    });
  });
});

describe('handleKeyDown', () => {
  const noSel = {};
  const typeSel = { typeName: 'Plot' };
  const fieldSel = { typeName: 'Plot', fieldName: 'name' };

  it('Cmd/Ctrl+Z → undo command', () => {
    expect(
      handleKeyDown({ key: 'z', metaKey: true, ctrlKey: false, shiftKey: false }, noSel),
    ).toEqual({ kind: 'command', command: 'undo' });
    expect(
      handleKeyDown({ key: 'Z', metaKey: false, ctrlKey: true, shiftKey: false }, noSel),
    ).toEqual({ kind: 'command', command: 'undo' });
  });

  it('Cmd/Ctrl+Shift+Z → redo command', () => {
    expect(
      handleKeyDown({ key: 'z', metaKey: true, ctrlKey: false, shiftKey: true }, noSel),
    ).toEqual({ kind: 'command', command: 'redo' });
  });

  it('Cmd/Ctrl+Y → redo command', () => {
    expect(
      handleKeyDown({ key: 'y', metaKey: false, ctrlKey: true, shiftKey: false }, noSel),
    ).toEqual({ kind: 'command', command: 'redo' });
  });

  it('F2 with selected type → rename command; without selection → null', () => {
    expect(
      handleKeyDown({ key: 'F2', metaKey: false, ctrlKey: false, shiftKey: false }, typeSel),
    ).toEqual({ kind: 'command', command: 'rename' });
    expect(
      handleKeyDown({ key: 'F2', metaKey: false, ctrlKey: false, shiftKey: false }, noSel),
    ).toBeNull();
  });

  it('Delete with selected field → remove_field op', () => {
    expect(
      handleKeyDown({ key: 'Delete', metaKey: false, ctrlKey: false, shiftKey: false }, fieldSel),
    ).toEqual({
      kind: 'op',
      op: { kind: 'remove_field', typeName: 'Plot', fieldName: 'name' },
    });
  });

  it('Delete with only selected type → delete_type op', () => {
    expect(
      handleKeyDown({ key: 'Delete', metaKey: false, ctrlKey: false, shiftKey: false }, typeSel),
    ).toEqual({ kind: 'op', op: { kind: 'delete_type', name: 'Plot' } });
  });

  it('Delete without selection → null', () => {
    expect(
      handleKeyDown({ key: 'Delete', metaKey: false, ctrlKey: false, shiftKey: false }, noSel),
    ).toBeNull();
  });

  it('unrelated key → null', () => {
    expect(
      handleKeyDown({ key: 'a', metaKey: false, ctrlKey: false, shiftKey: false }, typeSel),
    ).toBeNull();
  });
});

describe('handleConnect', () => {
  it('produces update_field ref op for valid payload', () => {
    expect(
      handleConnect({
        sourceTypeName: 'Plot',
        sourceFieldName: 'harvest',
        targetTypeName: 'Harvest',
      }),
    ).toEqual({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'harvest',
      patch: { type: { kind: 'ref', typeName: 'Harvest' } },
    });
  });

  it('drops self-ref (source === target)', () => {
    expect(
      handleConnect({
        sourceTypeName: 'Plot',
        sourceFieldName: 'self',
        targetTypeName: 'Plot',
      }),
    ).toBeNull();
  });

  it('drops payload with missing parts', () => {
    expect(
      handleConnect({ sourceTypeName: '', sourceFieldName: 'x', targetTypeName: 'Y' }),
    ).toBeNull();
  });
});

describe('menu builders', () => {
  it('menuForType includes rename/add-field/delete', () => {
    const items = menuForType('Plot');
    expect(items.map((i) => i.label)).toEqual(['Rename…', 'Add field…', 'Delete']);
    expect(items[2].op).toEqual({ kind: 'delete_type', name: 'Plot' });
    expect(items[2].destructive).toBe(true);
  });

  it('menuForField includes edit/delete', () => {
    const items = menuForField('Plot', 'name');
    expect(items.map((i) => i.label)).toEqual(['Edit field…', 'Delete field']);
    expect(items[1].op).toEqual({ kind: 'remove_field', typeName: 'Plot', fieldName: 'name' });
  });
});
