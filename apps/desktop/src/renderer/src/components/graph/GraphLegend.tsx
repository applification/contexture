/**
 * Canvas legend — Zod/Contexture edition.
 *
 * Pins to the bottom-right of the graph. Collapsed by default so it
 * stays out of the way; expanded view names every visual affordance
 * the canvas uses so new users can decode the diagram at a glance.
 *
 * Matches the four `TypeDef` kinds (object / enum / discriminatedUnion
 * / raw) and the two `RefEdge` modes (same-schema ref vs cross-boundary
 * import). Colours are pulled from `globals.css` so theme changes flow
 * through without edits here.
 */
import { ChevronDown, ChevronUp } from 'lucide-react';
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
    label: 'Import (cross-boundary)',
    color: 'var(--graph-edge-import)',
    dash: '6,4',
  },
];

interface NodeItem {
  label: string;
  /** Header swatch colour — matches `headerColorFor` in `TypeNode`. */
  header: string;
  /** Border style. Imported refs render dashed; everything else solid. */
  style?: 'solid' | 'dashed';
}

const NODE_ITEMS: readonly NodeItem[] = [
  { label: 'Object', header: 'var(--graph-node-header-bg)' },
  {
    label: 'Enum',
    header: 'color-mix(in oklch, var(--chart-3) 85%, transparent)',
  },
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
    label: 'Selected',
    header: 'var(--graph-node-selected)',
  },
];

export const GraphLegend = memo(function GraphLegend() {
  const [expanded, setExpanded] = useState(false);

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
            <span className="text-[9px] text-muted-foreground font-medium uppercase">Nodes</span>
            {NODE_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div
                  aria-hidden="true"
                  className="shrink-0 rounded"
                  style={{
                    width: 18,
                    height: 12,
                    background: 'var(--graph-node-body-bg)',
                    border: `1px ${item.style ?? 'solid'} var(--graph-node-border)`,
                    boxShadow: `inset 0 3px 0 ${item.header}`,
                  }}
                />
                <span className="text-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
