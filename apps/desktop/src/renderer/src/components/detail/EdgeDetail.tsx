/**
 * EdgeDetail — read-only graph-edge metadata for a selected edge.
 *
 * Edges are derived from the IR — field refs come from object fields,
 * inferred table-id edges come from a diagram-only field convention, and
 * union-variant edges come from discriminated-union `variants`. There is
 * no edge entity to mutate directly.
 */
import { GitBranch, Link2, type LucideIcon, Table2 } from 'lucide-react';
import type { RefEdgeData } from '../graph/schema-to-graph';

export interface EdgeDetailProps {
  data: RefEdgeData;
  onEditField?: (typeName: string, fieldName: string) => void;
}

export function EdgeDetail({ data, onEditField }: EdgeDetailProps) {
  const meta = edgeKindMeta(data);
  const editableSourceField = data.relation === 'unionVariant' ? undefined : data.sourceField;
  const Icon = meta.icon;

  return (
    <div className="space-y-2 p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
          {meta.label}
        </span>
        {data.crossBoundary && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            cross-boundary
          </span>
        )}
      </div>
      <dl className="space-y-1">
        <Row term="Source type" detail={data.sourceType} />
        {data.relation === 'unionVariant' ? (
          <Row term="Discriminator" detail={data.discriminator ?? ''} />
        ) : (
          <Row term="Source field" detail={data.sourceField ?? ''} />
        )}
        <Row term="Target" detail={data.targetType} />
      </dl>
      {editableSourceField && onEditField && (
        <button
          type="button"
          className="text-xs underline text-muted-foreground hover:text-foreground"
          onClick={() => onEditField(data.sourceType, editableSourceField)}
        >
          Edit field
        </button>
      )}
    </div>
  );
}

function edgeKindMeta(data: RefEdgeData): { icon: LucideIcon; label: string } {
  if (data.relation === 'unionVariant') {
    return { icon: GitBranch, label: 'Union variant edge' };
  }
  if (data.relation === 'tableId') {
    return { icon: Table2, label: 'Inferred table id edge' };
  }
  return { icon: Link2, label: 'Modeled ref edge' };
}

function Row({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="min-w-0 truncate text-right" title={detail}>
        {detail}
      </dd>
    </div>
  );
}
