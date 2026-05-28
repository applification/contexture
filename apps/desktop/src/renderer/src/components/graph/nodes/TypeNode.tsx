/**
 * TypeNode — renders one Contexture `TypeDef` on the canvas.
 *
 * Visual language:
 *   - Glassmorphic body with backdrop-blur so edges behind show through.
 *   - Coloured header strip (primary accent for object / DU, chart
 *     colours for enum / raw) so different TypeDef kinds read at a
 *     glance without a badge.
 *   - Field rows under the header as a flat list, right-aligned type
 *     summary (ref fields use the edge-property colour for the summary).
 *   - Table objects add a persistent left rail and header icon so they
 *     remain distinguishable from value objects without relying on colour.
 *   - Selection, adjacency dimming, and imported-boundary styling all
 *     driven from the UI store.
 *
 * The footprint uses XYFlow `<Handle>`s as invisible connection points;
 * the actual edge anchoring uses floating intersection math in
 * `floating-edge-utils.ts`. Field-level drag-to-ref handles come in a
 * later slice.
 */
import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import { CircleAlert, Table2 } from 'lucide-react';
import type { CSSProperties } from 'react';
import { memo, useCallback, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useGraphSelectionStore } from '../../../store/selection';
import { type FieldRefPreview, TYPE_NODE_REF_PREVIEW_EVENT } from '../ref-preview-event';
import type { EnumTargetRow, TypeNodeData } from '../schema-to-graph';

export interface FieldSelection {
  typeName: string;
  fieldName: string;
}

export const TYPE_NODE_EVENT = 'contexture:field-select' as const;
export const TYPE_NODE_ADD_FIELD_EVENT = 'contexture:type-node-add-field' as const;

type TypeNodeKind = Node<TypeNodeData, 'type'>;

/**
 * Header colour per TypeDef kind. Uses OKLCH tokens already defined in
 * `globals.css`; falling back to `--primary` so any future kind still
 * renders a legible header.
 */
function headerColorFor(kind: TypeNodeData['kind']): string {
  switch (kind) {
    case 'object':
      return 'var(--graph-node-header-bg)';
    case 'enum':
      return 'color-mix(in oklch, var(--chart-3) 85%, transparent)';
    case 'discriminatedUnion':
      return 'color-mix(in oklch, var(--chart-4) 85%, transparent)';
    case 'raw':
      return 'color-mix(in oklch, var(--muted-foreground) 55%, transparent)';
    default:
      return 'var(--graph-node-header-bg)';
  }
}

const enumValueBadgeStyle: CSSProperties = {
  background: 'color-mix(in oklch, var(--chart-3) 85%, transparent)',
  borderColor: 'color-mix(in oklch, var(--chart-3) 85%, transparent)',
  color: 'var(--graph-node-header-text)',
};

const enumHoverCardStyle: CSSProperties = {
  borderTop: '2px solid color-mix(in oklch, var(--chart-3) 85%, transparent)',
};

export const TypeNode = memo(function TypeNode(props: NodeProps<TypeNodeKind>) {
  const { data, id } = props;
  const click = useGraphSelectionStore((s) => s.click);
  const primaryNodeId = useGraphSelectionStore((s) => s.state.primaryNodeId);
  const adjacentNodeIds = useGraphSelectionStore((s) => s.state.adjacency.nodeIds);

  const isSelected = primaryNodeId === id;
  const isAdjacent = !isSelected && adjacentNodeIds.has(id);
  const isPreviewPrimary = data.previewRole === 'primary' && !isSelected;
  const isPreviewAdjacent = data.previewRole === 'adjacent' && !isSelected && !isAdjacent;
  const isDimmed =
    (primaryNodeId !== null &&
      !isSelected &&
      !isAdjacent &&
      !isPreviewPrimary &&
      !isPreviewAdjacent) ||
    (data.previewDimmed === true && !isSelected && !isPreviewPrimary && !isPreviewAdjacent);
  const isSyncHighlighted = data.syncHighlighted === true && !isSelected && !isAdjacent;
  const hasValidationIssues = (data.validationIssueCount ?? 0) > 0;

  const onFieldClick = useCallback(
    (field: TypeNodeData['fields'][number], ev: React.MouseEvent<HTMLElement>) => {
      ev.stopPropagation();
      if (field.refTarget && !field.enumTarget) {
        click(field.refTarget, 'replace');
        return;
      }
      click(data.typeName, 'replace');
      const detail: FieldSelection = { typeName: data.typeName, fieldName: field.name };
      ev.currentTarget.dispatchEvent(new CustomEvent(TYPE_NODE_EVENT, { bubbles: true, detail }));
    },
    [data.typeName, click],
  );

  const onRefPreview = useCallback(
    (
      field: TypeNodeData['fields'][number],
      active: boolean,
      ev: React.SyntheticEvent<HTMLElement>,
    ) => {
      if (!field.refTarget) return;
      const detail: FieldRefPreview = {
        sourceType: data.typeName,
        sourceField: field.name,
        targetType: field.refTarget,
        active,
      };
      ev.currentTarget.dispatchEvent(
        new CustomEvent(TYPE_NODE_REF_PREVIEW_EVENT, { bubbles: true, detail }),
      );
    },
    [data.typeName],
  );

  const onAddField = useCallback(
    (ev: React.MouseEvent<HTMLButtonElement>) => {
      ev.stopPropagation();
      ev.currentTarget.dispatchEvent(
        new CustomEvent(TYPE_NODE_ADD_FIELD_EVENT, {
          bubbles: true,
          detail: { typeName: data.typeName },
        }),
      );
    },
    [data.typeName],
  );

  const borderColor = isSelected
    ? 'var(--graph-node-selected)'
    : isAdjacent
      ? 'var(--graph-node-adjacent)'
      : isPreviewPrimary
        ? 'var(--graph-node-selected)'
        : isPreviewAdjacent
          ? 'var(--graph-node-adjacent)'
          : 'var(--graph-node-border)';
  const borderWidth = isSelected || isAdjacent ? 2 : 1;
  const borderStyle = data.imported ? 'dashed' : 'solid';
  const headerColor = useMemo(
    () => (data.table ? 'var(--graph-node-table-header-bg)' : headerColorFor(data.kind)),
    [data.kind, data.table],
  );
  const node = (
    <div
      data-testid="type-node"
      data-type-name={data.typeName}
      data-imported={data.imported ? 'true' : 'false'}
      data-selected={isSelected ? 'true' : 'false'}
      data-adjacent={isAdjacent ? 'true' : 'false'}
      data-validation-issues={hasValidationIssues ? 'true' : undefined}
      title={
        hasValidationIssues
          ? `${data.validationIssueCount} validation ${
              data.validationIssueCount === 1 ? 'issue' : 'issues'
            }`
          : undefined
      }
      {...(data.table ? { 'data-table': 'true' } : {})}
      className="contexture-type-node"
      style={{
        minWidth: 180,
        maxWidth: 260,
        position: 'relative',
        borderRadius: 8,
        overflow: 'hidden',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderWidth,
        borderStyle,
        borderColor,
        boxShadow: '0 2px 10px oklch(0 0 0 / 0.18), 0 0 1px oklch(0 0 0 / 0.15)',
        background:
          isSelected || isPreviewPrimary ? 'var(--graph-node-selected-bg)' : 'transparent',
        outline: isSyncHighlighted
          ? '2px solid color-mix(in oklch, var(--chart-2) 78%, var(--background))'
          : undefined,
        outlineOffset: isSyncHighlighted ? 3 : undefined,
        opacity: isDimmed ? 0.22 : data.imported ? 0.75 : 1,
        transition: 'opacity 0.15s ease, border-color 0.1s ease',
      }}
    >
      {data.table ? (
        <div
          aria-hidden="true"
          data-testid="type-node-table-rail"
          style={{
            position: 'absolute',
            insetBlock: 0,
            insetInlineStart: 0,
            width: 4,
            background: 'var(--graph-node-table-accent)',
            zIndex: 1,
          }}
        />
      ) : null}
      {hasValidationIssues ? (
        <div
          aria-hidden="true"
          data-testid="type-node-validation-rail"
          style={{
            position: 'absolute',
            insetBlock: 0,
            insetInlineEnd: 0,
            width: 3,
            background: 'var(--destructive)',
            zIndex: 2,
          }}
        />
      ) : null}

      {/* Invisible handles — floating edges use intersection math to find
         the edge crossing point, so actual anchor position doesn't matter. */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ opacity: 0, top: '50%', left: '50%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ opacity: 0, top: '50%', left: '50%' }}
      />

      <div
        data-testid="type-node-header"
        style={{
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--graph-node-header-text)',
          background: headerColor,
          letterSpacing: '0.01em',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingLeft: data.table ? 12 : 10,
        }}
      >
        {data.table ? (
          <Table2
            aria-hidden="true"
            data-testid="type-node-table-icon"
            size={14}
            strokeWidth={2.2}
            style={{ flex: '0 0 auto', opacity: 0.92 }}
          />
        ) : null}
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {data.typeName}
        </span>
        {hasValidationIssues && (
          <span
            data-testid="type-node-validation-label"
            role="img"
            aria-label={`${data.validationIssueCount} validation ${
              data.validationIssueCount === 1 ? 'issue' : 'issues'
            }`}
            title={`${data.validationIssueCount} validation ${
              data.validationIssueCount === 1 ? 'issue' : 'issues'
            }`}
            style={{
              flex: '0 0 auto',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              minWidth: 18,
              height: 18,
              borderRadius: 999,
              background: 'color-mix(in oklch, var(--destructive) 24%, var(--background))',
              color: 'var(--destructive-foreground)',
              border: '1px solid color-mix(in oklch, var(--destructive) 60%, transparent)',
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            <CircleAlert aria-hidden="true" size={11} strokeWidth={2.4} />
            {data.validationIssueCount && data.validationIssueCount > 1
              ? data.validationIssueCount
              : null}
          </span>
        )}
        {data.table ? (
          <NodeKindLabel data-testid="type-node-table-label">table</NodeKindLabel>
        ) : (
          <NodeKindLabel>{data.kind === 'discriminatedUnion' ? 'union' : data.kind}</NodeKindLabel>
        )}
      </div>

      {data.fields.length > 0 && (
        <div
          style={{
            padding: '4px 0',
            background: 'var(--graph-node-body-bg)',
          }}
        >
          {data.fields.map((f) => (
            <FieldRowButton
              key={f.name}
              field={f}
              selectedTarget={primaryNodeId}
              searchFocused={data.focusedFieldName === f.name}
              onFieldClick={onFieldClick}
              onRefPreview={onRefPreview}
            />
          ))}
        </div>
      )}
      {data.canAddFields && !data.imported && (
        <button
          type="button"
          data-testid="type-node-add-field"
          onClick={onAddField}
          className="contexture-type-node-add-field hover:bg-accent/35 focus-visible:bg-accent/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
          style={{
            display: 'flex',
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            border: 'none',
            borderTop: '1px solid color-mix(in oklch, var(--border) 70%, transparent)',
            background: 'var(--graph-node-body-bg)',
            color: 'var(--muted-foreground)',
            cursor: 'pointer',
            fontSize: 11,
            minHeight: 28,
            padding: '6px 10px',
          }}
        >
          + field
        </button>
      )}
    </div>
  );

  if (data.kind !== 'enum' || data.imported) return node;

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{node}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="w-72 p-3 text-xs"
        style={enumHoverCardStyle}
      >
        <EnumHoverCardContent
          enumTarget={{
            name: data.typeName,
            description: data.description,
            values: data.enumValues ?? [],
          }}
        />
      </HoverCardContent>
    </HoverCard>
  );
});

function NodeKindLabel({
  children,
  ...props
}: React.PropsWithChildren<React.HTMLAttributes<HTMLSpanElement>>) {
  return (
    <span
      {...props}
      style={{
        fontSize: 9,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        opacity: 0.75,
        ...props.style,
      }}
    >
      {children}
    </span>
  );
}

function EnumHoverCardContent({ enumTarget }: { enumTarget: EnumTargetRow }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-sm font-semibold text-foreground">{enumTarget.name}</div>
        <div
          className="text-[10px] font-medium uppercase tracking-wide"
          style={{ color: 'color-mix(in oklch, var(--chart-3) 85%, transparent)' }}
        >
          Enum
        </div>
        {enumTarget.description && (
          <p className="text-xs leading-snug text-muted-foreground">{enumTarget.description}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Values
        </div>
        <div className="flex flex-wrap gap-1.5">
          {enumTarget.values.map((value) => (
            <Badge
              key={value.value}
              data-testid="enum-value-badge"
              variant="default"
              title={value.description}
              className="max-w-full rounded border px-1.5 py-0 text-[10px] font-semibold shadow-sm hover:opacity-90"
              style={enumValueBadgeStyle}
            >
              <span className="truncate">{value.value}</span>
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

function FieldRowButton({
  field,
  selectedTarget,
  searchFocused,
  onFieldClick,
  onRefPreview,
}: {
  field: TypeNodeData['fields'][number];
  selectedTarget: string | null;
  searchFocused: boolean;
  onFieldClick: (field: TypeNodeData['fields'][number], ev: React.MouseEvent<HTMLElement>) => void;
  onRefPreview: (
    field: TypeNodeData['fields'][number],
    active: boolean,
    ev: React.SyntheticEvent<HTMLElement>,
  ) => void;
}) {
  const refTargetSelected = field.refTarget !== undefined && field.refTarget === selectedTarget;
  const hasValidationIssues = (field.validationIssueCount ?? 0) > 0;
  const [enumCardOpen, setEnumCardOpen] = useState(false);
  const enumSummary = field.enumTarget ? `${field.summary.replace(/^→\s*/, '')} enum` : undefined;
  const isUnionRef = field.refTargetKind === 'discriminatedUnion';
  const button = (
    <button
      type="button"
      data-testid="type-node-field"
      data-field-name={field.name}
      data-validation-issues={hasValidationIssues ? 'true' : undefined}
      onClick={(ev) => onFieldClick(field, ev)}
      onFocus={field.enumTarget ? () => setEnumCardOpen(true) : undefined}
      onBlur={field.enumTarget ? () => setEnumCardOpen(false) : undefined}
      onMouseEnter={(ev) => onRefPreview(field, true, ev)}
      onMouseLeave={(ev) => onRefPreview(field, false, ev)}
      onFocusCapture={(ev) => onRefPreview(field, true, ev)}
      onBlurCapture={(ev) => onRefPreview(field, false, ev)}
      aria-label={
        field.enumTarget
          ? `${field.name}, ${field.enumTarget.name} enum, ${field.enumTarget.values.length} values`
          : undefined
      }
      data-search-focused={searchFocused ? 'true' : 'false'}
      className="contexture-type-node-field hover:bg-accent/35 focus-visible:bg-accent/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '2px 10px',
        fontSize: 10,
        gap: 8,
        width: '100%',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        background: searchFocused
          ? 'var(--graph-node-selected-bg)'
          : hasValidationIssues
            ? 'color-mix(in oklch, var(--destructive) 10%, transparent)'
            : undefined,
        boxShadow: searchFocused
          ? 'inset 3px 0 0 var(--graph-node-selected), inset 0 0 0 1px color-mix(in oklch, var(--graph-node-selected) 34%, transparent)'
          : hasValidationIssues
            ? 'inset 3px 0 0 var(--destructive)'
            : undefined,
      }}
    >
      <span
        style={{
          color: hasValidationIssues ? 'var(--destructive)' : 'var(--muted-foreground)',
          fontWeight: 400,
        }}
      >
        {field.name}
        {field.optional ? '?' : ''}
        {field.nullable ? ' | null' : ''}
      </span>
      <span
        data-testid={
          field.enumTarget
            ? 'type-node-field-enum-summary'
            : field.refTarget
              ? 'type-node-field-ref-summary'
              : undefined
        }
        style={{
          color: refTargetSelected
            ? 'var(--graph-node-selected)'
            : field.enumTarget
              ? 'var(--muted-foreground)'
              : field.refTarget
                ? 'var(--graph-edge-property)'
                : 'var(--muted-foreground)',
          fontFamily: field.enumTarget
            ? 'var(--font-mono)'
            : field.refTarget
              ? 'inherit'
              : 'var(--font-mono)',
          fontSize: 9,
          fontWeight: refTargetSelected ? 700 : 400,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {field.enumTarget ? (
          <span
            data-testid="type-node-field-enum-affordance"
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {enumSummary}
          </span>
        ) : isUnionRef ? (
          <span
            data-testid="type-node-field-union-affordance"
            style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              maxWidth: '100%',
              minWidth: 0,
              gap: 3,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {field.summary}
            </span>
            <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>· union</span>
          </span>
        ) : (
          field.summary
        )}
      </span>
    </button>
  );

  if (!field.enumTarget) return button;

  return (
    <HoverCard open={enumCardOpen} onOpenChange={setEnumCardOpen} openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{button}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="w-72 p-3 text-xs"
        style={enumHoverCardStyle}
      >
        <EnumHoverCardContent enumTarget={field.enumTarget} />
      </HoverCardContent>
    </HoverCard>
  );
}
