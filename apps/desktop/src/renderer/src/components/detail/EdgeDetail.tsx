/**
 * EdgeDetail — read-only graph-edge metadata for a selected edge.
 *
 * Edges are derived from the IR — field refs come from object fields,
 * inferred table-id edges come from a diagram-only field convention, and
 * union-variant edges come from discriminated-union `variants`. There is
 * no edge entity to mutate directly.
 */
import type { RefEdgeData } from '../graph/schema-to-graph';

export interface EdgeDetailProps {
  data: RefEdgeData;
  onEditField?: (typeName: string, fieldName: string) => void;
}

export function EdgeDetail({ data, onEditField }: EdgeDetailProps) {
  const isUnionVariant = data.relation === 'unionVariant';
  const isTableId = data.relation === 'tableId';
  const editableSourceField = isUnionVariant ? undefined : data.sourceField;

  return (
    <div className="space-y-2 p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">
          {isUnionVariant
            ? 'Union variant edge'
            : isTableId
              ? 'Inferred table id edge'
              : 'Ref edge'}
        </span>
        {data.crossBoundary && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            cross-boundary
          </span>
        )}
      </div>
      <dl className="space-y-1">
        <Row term="Source type" detail={data.sourceType} />
        {isUnionVariant ? (
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

function Row({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{term}</dt>
      <dd>{detail}</dd>
    </div>
  );
}
