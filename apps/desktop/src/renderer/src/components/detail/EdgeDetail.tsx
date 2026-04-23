/**
 * EdgeDetail — read-only ref metadata for a selected edge.
 *
 * Edges are purely derived from the IR (a field's `ref` target) — there
 * is no "edge entity" to mutate directly. Editing the source field
 * belongs in `FieldDetail`, so this panel just surfaces the source
 * type, source field, and target type plus a "edit field" affordance
 * that flips the selection to the driving field.
 */
import type { RefEdgeData } from '../graph/schema-to-graph';

export interface EdgeDetailProps {
  data: RefEdgeData;
  onEditField?: (typeName: string, fieldName: string) => void;
}

export function EdgeDetail({ data, onEditField }: EdgeDetailProps) {
  return (
    <div className="space-y-2 p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Ref edge</span>
        {data.crossBoundary && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            cross-boundary
          </span>
        )}
      </div>
      <dl className="space-y-1">
        <Row term="Source type" detail={data.sourceType} />
        <Row term="Source field" detail={data.sourceField} />
        <Row term="Target" detail={data.targetType} />
      </dl>
      {onEditField && (
        <button
          type="button"
          className="text-xs underline text-muted-foreground hover:text-foreground"
          onClick={() => onEditField(data.sourceType, data.sourceField)}
        >
          Edit field
        </button>
      )}
    </div>
  );
}

function Row({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{term}</dt>
      <dd>{detail}</dd>
    </div>
  );
}
