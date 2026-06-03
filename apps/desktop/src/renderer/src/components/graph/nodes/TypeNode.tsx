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
import { CircleAlert, Focus, Table2 } from 'lucide-react';
import type { CSSProperties } from 'react';
import { memo, useCallback, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { type FieldSelection, useGraphSelectionStore } from '../../../store/selection';
import { type FieldRefPreview, TYPE_NODE_REF_PREVIEW_EVENT } from '../ref-preview-event';
import type { EnumTargetRow, StdlibTargetRow, TypeNodeData } from '../schema-to-graph';

export const TYPE_NODE_EVENT = 'contexture:field-select' as const;
export const TYPE_NODE_OBJECT_EVENT = 'contexture:type-select' as const;
export const TYPE_NODE_ADD_FIELD_EVENT = 'contexture:type-node-add-field' as const;
export const TYPE_NODE_TARGET_PROPERTIES_EVENT = 'contexture:type-node-target-properties' as const;

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

const stdlibAccent = 'color-mix(in oklch, var(--chart-2) 85%, transparent)';

const stdlibValueBadgeStyle: CSSProperties = {
  background: stdlibAccent,
  borderColor: stdlibAccent,
  color: 'var(--graph-node-header-text)',
};

const enumHoverCardStyle: CSSProperties = {
  borderTop: '2px solid color-mix(in oklch, var(--chart-3) 85%, transparent)',
};

const stdlibHoverCardStyle: CSSProperties = {
  borderTop: `2px solid ${stdlibAccent}`,
};

export const TypeNode = memo(function TypeNode(props: NodeProps<TypeNodeKind>) {
  const { data, id } = props;
  const click = useGraphSelectionStore((s) => s.click);
  const primaryNodeId = useGraphSelectionStore((s) => s.state.primaryNodeId);
  const selectedField = useGraphSelectionStore((s) => s.state.selectedField);
  const selectedEdge = useGraphSelectionStore((s) => s.state.selectedEdge);
  const adjacentNodeIds = useGraphSelectionStore((s) => s.state.adjacency.nodeIds);
  const [headerHighlighted, setHeaderHighlighted] = useState(false);

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
  const fieldsInSelectedType =
    isSelected && selectedEdge === null && selectedField?.typeName !== data.typeName;

  const onFieldClick = useCallback(
    (field: TypeNodeData['fields'][number], ev: React.MouseEvent<HTMLElement>) => {
      ev.stopPropagation();
      if (field.refTarget && !field.enumTarget && !field.stdlibTarget) {
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
  const onHeaderSelect = useCallback(
    (ev: React.MouseEvent<HTMLElement>) => {
      ev.stopPropagation();
      click(data.typeName, 'replace');
      ev.currentTarget.dispatchEvent(
        new CustomEvent(TYPE_NODE_OBJECT_EVENT, {
          bubbles: true,
          detail: { typeName: data.typeName },
        }),
      );
    },
    [click, data.typeName],
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
    () =>
      data.stdlib
        ? 'color-mix(in oklch, var(--chart-2) 72%, var(--graph-node-header-bg))'
        : data.table
          ? 'var(--graph-node-table-header-bg)'
          : headerColorFor(data.kind),
    [data.kind, data.table, data.stdlib],
  );
  const selectionAccent = useMemo(
    () => (data.table ? 'var(--graph-node-selected)' : headerColorFor(data.kind)),
    [data.kind, data.table],
  );
  const nodeKindLabel = data.stdlib
    ? 'stdlib'
    : data.table
      ? 'table'
      : data.kind === 'discriminatedUnion'
        ? 'union'
        : data.kind;
  const baseNodeShadow = '0 2px 10px oklch(0 0 0 / 0.18), 0 0 1px oklch(0 0 0 / 0.15)';
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
        borderColor:
          headerHighlighted && !isSelected
            ? 'color-mix(in oklch, var(--graph-node-selected) 38%, var(--graph-node-border))'
            : borderColor,
        boxShadow: baseNodeShadow,
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

      <button
        type="button"
        data-testid="type-node-header"
        title={`Show ${data.typeName} ${nodeKindLabel} properties`}
        aria-label={`Show ${data.typeName} ${nodeKindLabel} properties`}
        onClick={onHeaderSelect}
        onMouseEnter={() => setHeaderHighlighted(true)}
        onMouseLeave={() => setHeaderHighlighted(false)}
        onFocus={() => setHeaderHighlighted(true)}
        onBlur={() => setHeaderHighlighted(false)}
        className="focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/70"
        style={{
          width: '100%',
          border: 'none',
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 600,
          color: data.table
            ? 'var(--graph-node-table-header-text)'
            : 'var(--graph-node-header-text)',
          background: headerColor,
          boxShadow: data.table
            ? 'inset 0 -1px 0 color-mix(in oklch, var(--border) 75%, transparent)'
            : undefined,
          letterSpacing: '0.01em',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingLeft: data.table ? 12 : 10,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {data.table ? (
          <Table2
            aria-hidden="true"
            data-testid="type-node-table-icon"
            size={14}
            strokeWidth={2.2}
            style={{ flex: '0 0 auto', color: 'var(--graph-node-table-accent)' }}
          />
        ) : null}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {data.typeName}
        </span>
        <span
          style={{
            flex: '0 0 auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            minWidth: 0,
          }}
        >
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
            <NodeKindLabel
              data-testid="type-node-table-label"
              style={{ color: 'var(--graph-node-table-accent)', opacity: 1 }}
            >
              table
            </NodeKindLabel>
          ) : (
            <NodeKindLabel>{nodeKindLabel}</NodeKindLabel>
          )}
        </span>
      </button>

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
              selected={
                selectedField?.typeName === data.typeName && selectedField.fieldName === f.name
              }
              selectionAccent={selectionAccent}
              groupSelected={fieldsInSelectedType}
              groupHighlighted={headerHighlighted}
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

function openTargetProperties(typeName: string, ev: React.MouseEvent<HTMLButtonElement>): void {
  ev.preventDefault();
  ev.stopPropagation();
  document.dispatchEvent(
    new CustomEvent(TYPE_NODE_TARGET_PROPERTIES_EVENT, { detail: { typeName } }),
  );
}

function TargetPropertiesButton({ typeName }: { typeName: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
      aria-label={`Show ${typeName} properties`}
      title={`Show ${typeName} properties`}
      onClick={(ev) => openTargetProperties(typeName, ev)}
    >
      <Focus className="size-3.5" aria-hidden="true" />
    </Button>
  );
}

function EnumHoverCardContent({ enumTarget }: { enumTarget: EnumTargetRow }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 text-sm font-semibold text-foreground">{enumTarget.name}</div>
          <TargetPropertiesButton typeName={enumTarget.name} />
        </div>
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
  selected,
  selectionAccent,
  groupSelected,
  groupHighlighted,
  searchFocused,
  onFieldClick,
  onRefPreview,
}: {
  field: TypeNodeData['fields'][number];
  selectedTarget: string | null;
  selected: boolean;
  selectionAccent: string;
  groupSelected: boolean;
  groupHighlighted: boolean;
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
  const [metadataCardOpen, setMetadataCardOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(false);
  const enumSummary = field.enumTarget ? `${field.summary.replace(/^→\s*/, '')} enum` : undefined;
  const stdlibSummary = field.stdlibTarget ? field.summary.replace(/^→\s*/, '') : undefined;
  const isUnionRef = field.refTargetKind === 'discriminatedUnion';
  const hoverTarget = field.enumTarget ?? field.stdlibTarget;
  const button = (
    <button
      type="button"
      data-testid="type-node-field"
      data-field-name={field.name}
      data-selected-field={selected ? 'true' : undefined}
      data-validation-issues={hasValidationIssues ? 'true' : undefined}
      onClick={(ev) => onFieldClick(field, ev)}
      onFocus={() => {
        setHighlighted(true);
        if (hoverTarget) setMetadataCardOpen(true);
      }}
      onBlur={() => {
        setHighlighted(false);
        if (hoverTarget) setMetadataCardOpen(false);
      }}
      onMouseEnter={(ev) => {
        setHighlighted(true);
        onRefPreview(field, true, ev);
      }}
      onMouseLeave={(ev) => {
        setHighlighted(false);
        onRefPreview(field, false, ev);
      }}
      onFocusCapture={(ev) => onRefPreview(field, true, ev)}
      onBlurCapture={(ev) => onRefPreview(field, false, ev)}
      aria-label={
        field.enumTarget
          ? `${field.name}, ${field.enumTarget.name} enum, ${field.enumTarget.values.length} values`
          : field.stdlibTarget
            ? `${field.name}, ${field.stdlibTarget.name} stdlib type`
            : undefined
      }
      data-search-focused={searchFocused ? 'true' : 'false'}
      className="contexture-type-node-field focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
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
        background: selected
          ? `color-mix(in oklch, ${selectionAccent} 12%, var(--graph-node-body-bg))`
          : groupSelected
            ? `color-mix(in oklch, ${selectionAccent} 5%, var(--graph-node-body-bg))`
            : highlighted
              ? `color-mix(in oklch, ${selectionAccent} 6%, var(--graph-node-body-bg))`
              : groupHighlighted
                ? `color-mix(in oklch, ${selectionAccent} 3%, var(--graph-node-body-bg))`
                : searchFocused
                  ? 'var(--graph-node-selected-bg)'
                  : hasValidationIssues
                    ? 'color-mix(in oklch, var(--destructive) 10%, transparent)'
                    : undefined,
        boxShadow: selected
          ? `inset 2px 0 0 ${selectionAccent}, inset 0 -1px 0 color-mix(in oklch, var(--border) 82%, transparent)`
          : groupSelected || highlighted
            ? 'inset 0 -1px 0 color-mix(in oklch, var(--border) 82%, transparent)'
            : searchFocused
              ? 'inset 3px 0 0 var(--graph-node-selected), inset 0 -1px 0 color-mix(in oklch, var(--border) 82%, transparent)'
              : hasValidationIssues
                ? 'inset 3px 0 0 var(--destructive), inset 0 -1px 0 color-mix(in oklch, var(--border) 82%, transparent)'
                : 'inset 0 -1px 0 color-mix(in oklch, var(--border) 82%, transparent)',
      }}
    >
      <span
        style={{
          color: selected
            ? `color-mix(in oklch, ${selectionAccent} 58%, var(--foreground))`
            : groupSelected
              ? `color-mix(in oklch, ${selectionAccent} 46%, var(--foreground))`
              : highlighted
                ? `color-mix(in oklch, ${selectionAccent} 38%, var(--foreground))`
                : hasValidationIssues
                  ? 'var(--destructive)'
                  : 'var(--muted-foreground)',
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
            : field.stdlibTarget
              ? 'type-node-field-stdlib-summary'
              : field.refTarget
                ? 'type-node-field-ref-summary'
                : undefined
        }
        style={{
          color: refTargetSelected
            ? 'var(--graph-node-selected)'
            : selected
              ? `color-mix(in oklch, ${selectionAccent} 62%, var(--foreground))`
              : groupSelected
                ? `color-mix(in oklch, ${selectionAccent} 48%, var(--foreground))`
                : highlighted
                  ? `color-mix(in oklch, ${selectionAccent} 42%, var(--foreground))`
                  : field.enumTarget
                    ? 'var(--muted-foreground)'
                    : field.stdlibTarget
                      ? stdlibAccent
                      : field.refTarget
                        ? 'var(--graph-edge-ref)'
                        : 'var(--muted-foreground)',
          fontFamily: field.enumTarget
            ? 'var(--font-mono)'
            : field.stdlibTarget
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
        ) : field.stdlibTarget ? (
          <span
            data-testid="type-node-field-stdlib-affordance"
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {stdlibSummary}
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

  if (!hoverTarget) return button;

  return (
    <HoverCard
      open={metadataCardOpen}
      onOpenChange={setMetadataCardOpen}
      openDelay={120}
      closeDelay={80}
    >
      <HoverCardTrigger asChild>{button}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="w-72 p-3 text-xs"
        data-testid={
          field.enumTarget ? 'type-node-field-enum-hover-card' : 'type-node-field-stdlib-hover-card'
        }
        style={field.enumTarget ? enumHoverCardStyle : stdlibHoverCardStyle}
      >
        {field.enumTarget ? (
          <EnumHoverCardContent enumTarget={field.enumTarget} />
        ) : field.stdlibTarget ? (
          <StdlibHoverCardContent stdlibTarget={field.stdlibTarget} />
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}

function StdlibHoverCardContent({ stdlibTarget }: { stdlibTarget: StdlibTargetRow }) {
  const values = stdlibTarget.values ?? [];
  const visibleValues = values.slice(0, 18);
  const hiddenValueCount = values.length - visibleValues.length;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 text-sm font-semibold text-foreground">{stdlibTarget.name}</div>
          <TargetPropertiesButton typeName={stdlibTarget.name} />
        </div>
        <div
          data-testid="stdlib-kind-label"
          className="text-[10px] font-medium uppercase tracking-wide"
          style={{ color: stdlibAccent }}
        >
          Stdlib {stdlibTarget.kind}
        </div>
        {stdlibTarget.description && (
          <p className="text-xs leading-snug text-muted-foreground">{stdlibTarget.description}</p>
        )}
      </div>
      {values.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Values
          </div>
          <div className="flex flex-wrap gap-1.5">
            {visibleValues.map((value) => (
              <Badge
                key={value.value}
                data-testid="stdlib-value-badge"
                variant="default"
                title={value.description}
                className="max-w-full rounded border px-1.5 py-0 text-[10px] font-semibold shadow-sm hover:opacity-90"
                style={stdlibValueBadgeStyle}
              >
                <span className="truncate">{value.value}</span>
              </Badge>
            ))}
            {hiddenValueCount > 0 ? (
              <Badge
                data-testid="stdlib-value-more-badge"
                variant="default"
                className="rounded border px-1.5 py-0 text-[10px] font-semibold shadow-sm hover:opacity-90"
                style={stdlibValueBadgeStyle}
              >
                +{hiddenValueCount} more
              </Badge>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
