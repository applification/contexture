/**
 * Pure interaction handlers — event → op (or command).
 *
 * Every canvas interaction funnels through this file so the React
 * host (`GraphCanvas.tsx`) can stay a thin wiring layer and unit
 * tests don't have to boot XYFlow. Each exported helper takes the
 * minimum data the interaction needs (selection, current schema, the
 * event payload) and returns either an `Op` to dispatch, a UI command
 * (`undo` / `redo` / `rename`), or `null` when nothing should happen.
 *
 * Keyboard semantics match the app's undo hotkeys (`useUndoHotkeys`)
 * and the undo store (`store/undo.ts`): Cmd/Ctrl+Z undoes, Cmd/Ctrl+
 * Shift+Z (or Cmd/Ctrl+Y) redoes. `F2` raises a `rename` command so
 * the host can flip the node into rename mode — there's no "rename"
 * op until the text actually changes.
 */
import type { Schema, TypeDef } from '../../model/ir';
import type { Op } from '../../store/ops';

/** Selection shape passed from the UI store. */
export interface CanvasSelection {
  typeName?: string;
  fieldName?: string;
}

/** Result of `handleKeyDown` — either an op, a UI command, or nothing. */
export type KeyAction =
  | { kind: 'op'; op: Op }
  | { kind: 'command'; command: 'undo' | 'redo' | 'rename' }
  | null;

export interface KeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

/**
 * Generate a fresh `Type{N}` name that doesn't collide with the current
 * schema. Deterministic so tests can pin the output.
 */
export function nextTypeName(schema: Schema, prefix = 'Type'): string {
  const existing = new Set(schema.types.map((t) => t.name));
  for (let i = 1; i <= existing.size + 1; i++) {
    const candidate = `${prefix}${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  // Unreachable — loop bound exceeds existing size by 1.
  return `${prefix}${existing.size + 1}`;
}

/** Double-click on the empty canvas → `add_type` for a fresh object type. */
export function handleDoubleClick(schema: Schema): Op {
  const type: TypeDef = { kind: 'object', name: nextTypeName(schema), fields: [] };
  return { kind: 'add_type', type };
}

/** Keyboard → op / command. */
export function handleKeyDown(event: KeyEvent, selection: CanvasSelection): KeyAction {
  const mod = event.metaKey || event.ctrlKey;

  if (mod && (event.key === 'z' || event.key === 'Z')) {
    return event.shiftKey
      ? { kind: 'command', command: 'redo' }
      : { kind: 'command', command: 'undo' };
  }
  if (mod && (event.key === 'y' || event.key === 'Y')) {
    return { kind: 'command', command: 'redo' };
  }

  if (event.key === 'F2' && selection.typeName) {
    return { kind: 'command', command: 'rename' };
  }

  // Delete / Backspace.
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (selection.typeName && selection.fieldName) {
      return {
        kind: 'op',
        op: { kind: 'remove_field', typeName: selection.typeName, fieldName: selection.fieldName },
      };
    }
    if (selection.typeName) {
      return { kind: 'op', op: { kind: 'delete_type', name: selection.typeName } };
    }
  }
  return null;
}

/**
 * Drag-from-field-to-type-node completes a connection in XYFlow terms.
 * We translate it into an `update_field` op that sets the field's type
 * to a ref pointing at the target.
 *
 * Returns `null` when the target is the source's own type (self-ref
 * via drag is prevented here — users can still author it manually) or
 * when either side is missing.
 */
export interface ConnectPayload {
  sourceTypeName: string;
  sourceFieldName: string;
  targetTypeName: string;
}

export function handleConnect(payload: ConnectPayload): Op | null {
  const { sourceTypeName, sourceFieldName, targetTypeName } = payload;
  if (!sourceTypeName || !sourceFieldName || !targetTypeName) return null;
  if (sourceTypeName === targetTypeName) return null;
  return {
    kind: 'update_field',
    typeName: sourceTypeName,
    fieldName: sourceFieldName,
    patch: { type: { kind: 'ref', typeName: targetTypeName } },
  };
}

/** Context-menu entry shape — UI-agnostic. */
export interface MenuItem {
  label: string;
  destructive?: boolean;
  /** Op to dispatch; null means the host handles it (e.g. opens a dialog). */
  op: Op | null;
  /** Optional non-op command — rename / add-field mode etc. */
  command?: 'rename' | 'add-field';
}

/** Menu items when a type node is right-clicked. */
export function menuForType(typeName: string): MenuItem[] {
  return [
    { label: 'Rename…', op: null, command: 'rename' },
    { label: 'Add field…', op: null, command: 'add-field' },
    { label: 'Delete', destructive: true, op: { kind: 'delete_type', name: typeName } },
  ];
}

/** Menu items when a field row is right-clicked. */
export function menuForField(typeName: string, fieldName: string): MenuItem[] {
  return [
    { label: 'Edit field…', op: null },
    {
      label: 'Delete field',
      destructive: true,
      op: { kind: 'remove_field', typeName, fieldName },
    },
  ];
}
