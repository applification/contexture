/**
 * Canvas legend — Zod/Contexture edition.
 *
 * Pins to the bottom-right of the graph. Collapsed by default so it
 * stays out of the way; expanded view names every visual affordance
 * the canvas uses so new users can decode the diagram at a glance.
 *
 * Matches the `TypeDef` kinds, inline enum marker, table subtype marker,
 * and the edge modes (field ref, inferred table id, union variant,
 * cross-boundary import). Colours are pulled from `globals.css` so theme
 * changes flow through without edits here.
 */
import { ChevronDown, ChevronUp, Table2 } from 'lucide-react';
import { memo, useState } from 'react';

interface EdgeItem {
  label: string;
  color: string;
  dash?: string;
}

const EDGE_ITEMS: readonly EdgeItem[] = [
  {
    label: 'Ref',
    color: 'var(--graph-edge-ref)',
  },
  {
    label: 'Inferred table id',
    color: 'var(--graph-edge-ref)',
    dash: '6,4',
  },
  {
    label: 'Union variant',
    color: 'var(--graph-edge-union)',
    dash: '2,4',
  },
  {
    label: 'Import (cross-boundary)',
    color: 'var(--graph-edge-import)',
    dash: '6,4',
  },
];

interface NodeItem {
  label: string;
  /** Header swatch colour — matches `headerColorFor` in `TypeNode`. */
  header: string;
  table?: boolean;
  /** Border style. Imported refs render dashed; everything else solid. */
  style?: 'solid' | 'dashed';
}

const NODE_ITEMS: readonly NodeItem[] = [
  { label: 'Object', header: 'var(--graph-node-header-bg)' },
  { label: 'Table', header: 'var(--graph-node-table-header-bg)', table: true },
  {
    label: 'Discriminated union',
    header: 'color-mix(in oklch, var(--chart-4) 85%, transparent)',
  },
  {
    label: 'Raw (escape hatch)',
    header: 'color-mix(in oklch, var(--muted-foreground) 55%, transparent)',
  },
  {
    label: 'Imported',
    header: 'var(--graph-node-header-bg)',
    style: 'dashed',
  },
  {
    label: 'Stdlib',
    header: 'color-mix(in oklch, var(--chart-2) 72%, var(--graph-node-header-bg))',
    style: 'dashed',
  },
  {
    label: 'Selected',
    header: 'var(--graph-node-selected)',
  },
];

export const GraphLegend = memo(function GraphLegend({
  showEnumNodes = false,
  showStdlibNodes = false,
}: {
  showEnumNodes?: boolean;
  showStdlibNodes?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleNodeItems = showStdlibNodes
    ? NODE_ITEMS
    : NODE_ITEMS.filter((item) => item.label !== 'Stdlib');
  const nodeItems = showEnumNodes
    ? [
        ...visibleNodeItems.slice(0, 2),
        {
          label: 'Enum',
          header: 'color-mix(in oklch, var(--chart-3) 85%, transparent)',
        },
        ...visibleNodeItems.slice(2),
      ]
    : visibleNodeItems;

  return (
    <div
      className="absolute bottom-3 right-3 z-10 rounded-lg border border-border bg-background/80 backdrop-blur-md shadow-md text-xs select-none"
      style={{ minWidth: 150 }}
    >
      <button
        type="button"
        className="flex items-center justify-between w-full px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse legend' : 'Expand legend'}
      >
        Legend
        {expanded ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
      </button>

      {expanded && (
        <div className="px-2.5 pb-2 space-y-2">
          <div className="space-y-1">
            <span className="text-[9px] text-muted-foreground font-medium uppercase">Edges</span>
            {EDGE_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <svg width="24" height="8" className="shrink-0" aria-hidden="true">
                  <title>{`${item.label} edge swatch`}</title>
                  <line
                    x1="0"
                    y1="4"
                    x2="24"
                    y2="4"
                    stroke={item.color}
                    strokeWidth="2"
                    strokeDasharray={item.dash}
                  />
                </svg>
                <span className="text-foreground">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <span className="text-[9px] text-muted-foreground font-medium uppercase">Fields</span>
            <div className="flex items-center gap-2">
              <span className="text-[9px]" style={{ color: 'var(--graph-edge-property)' }}>
                → Reference
              </span>
              <span className="text-foreground">Object ref</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex min-w-0 items-baseline gap-0.5 text-[9px]"
                style={{ color: 'var(--graph-edge-property)' }}
              >
                <span>→ Source</span>
                <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>· union</span>
              </span>
              <span className="text-foreground">Union ref</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="text-[9px]"
                style={{
                  color: 'var(--muted-foreground)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Status enum
              </span>
              <span className="text-foreground">Inline enum</span>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[9px] text-muted-foreground font-medium uppercase">Nodes</span>
            {nodeItems.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div
                  aria-hidden="true"
                  className="relative shrink-0 overflow-hidden rounded"
                  style={{
                    width: 18,
                    height: 12,
                    background: 'var(--graph-node-body-bg)',
                    border: `1px ${item.style ?? 'solid'} var(--graph-node-border)`,
                    boxShadow: `inset 0 3px 0 ${item.header}`,
                  }}
                >
                  {item.table ? (
                    <>
                      <span
                        className="absolute inset-y-0 left-0"
                        style={{
                          width: 3,
                          background: 'var(--graph-node-table-accent)',
                        }}
                      />
                      <Table2
                        size={8}
                        strokeWidth={2.2}
                        className="absolute right-0.5 top-0.5 text-white"
                      />
                    </>
                  ) : null}
                </div>
                <span className="text-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
