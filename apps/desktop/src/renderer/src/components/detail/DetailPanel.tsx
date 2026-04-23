/**
 * DetailPanel — selection router.
 *
 * Reads the UI store's selection (node + optional field + edge id) and
 * the IR from the undoable store, then dispatches to the appropriate
 * kind-specific sub-panel. If nothing is selected we render an empty
 * state rather than a blank panel so new users know where to click.
 *
 * Selection semantics:
 *   - `selectedNodeId` alone → TypeDetail
 *   - `selectedNodeId` + `selectedFieldName` → FieldDetail
 *   - `selectedEdgeId` → EdgeDetail (parsed from the edge's data)
 *
 * The selection state is a UI concern; the IR lookup is a store
 * concern. Splitting them like this keeps the panel test-only on the
 * selection prop surface.
 */
import { useSyncExternalStore } from 'react';
import type { Op } from '../../store/ops';
import { useUndoStore } from '../../store/undo';
import type { RefEdgeData } from '../graph/schema-to-graph';
import { EdgeDetail } from './EdgeDetail';
import { FieldDetail } from './FieldDetail';
import { TypeDetail } from './TypeDetail';

export interface Selection {
  typeName?: string;
  fieldName?: string;
  edge?: RefEdgeData;
}

export interface DetailPanelProps {
  selection: Selection;
}

export function DetailPanel({ selection }: DetailPanelProps) {
  const schema = useSyncExternalStore(useUndoStore.subscribe, () => useUndoStore.getState().schema);
  const dispatch = (op: Op) => {
    useUndoStore.getState().apply(op);
  };

  if (selection.edge) {
    return <EdgeDetail data={selection.edge} />;
  }

  if (!selection.typeName) {
    return <EmptyState message="Select a type, field, or edge to see details." />;
  }

  const type = schema.types.find((t) => t.name === selection.typeName);
  if (!type) {
    return <EmptyState message={`No type named "${selection.typeName}" in the current schema.`} />;
  }

  if (selection.fieldName) {
    if (type.kind !== 'object') {
      return <EmptyState message="Fields only exist on object types." />;
    }
    const field = type.fields.find((f) => f.name === selection.fieldName);
    if (!field) {
      return <EmptyState message={`No field named "${selection.fieldName}".`} />;
    }
    return <FieldDetail typeName={type.name} field={field} dispatch={dispatch} />;
  }

  return <TypeDetail type={type} dispatch={dispatch} />;
}

function EmptyState({ message }: { message: string }) {
  return <p className="p-4 text-xs text-muted-foreground">{message}</p>;
}
