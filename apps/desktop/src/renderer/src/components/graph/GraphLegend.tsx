import { ChevronDown, ChevronUp } from 'lucide-react';
import { memo, useState } from 'react';

const EDGE_ITEMS = [
  {
    label: 'Ref',
    color: 'var(--graph-edge-ref, currentColor)',
    dash: undefined,
  },
  {
    label: 'Import (cross-boundary)',
    color: 'var(--graph-edge-import, oklch(0.55 0.04 240))',
    dash: '6,4',
  },
] as const;

const NODE_ITEMS = [
  { label: 'Type', border: 'var(--graph-node-border)', style: 'solid' as const },
  {
    label: 'Import',
    border: 'var(--graph-node-border)',
    style: 'dashed' as const,
  },
  { label: 'Field', border: 'var(--graph-node-border)', style: 'solid' as const },
  { label: 'Selected', border: 'var(--graph-node-selected)', style: 'solid' as const },
] as const;

export const GraphLegend = memo(function GraphLegend() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="absolute bottom-3 right-3 z-10 rounded-lg border border-border bg-background/80 backdrop-blur-md shadow-md text-xs select-none"
      style={{ minWidth: 140 }}
    >
      <button
        type="button"
        className="flex items-center justify-between w-full px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        Legend
        {expanded ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
      </button>

      {expanded && (
        <div className="px-2.5 pb-2 space-y-2">
          {/* Edges */}
          <div className="space-y-1">
            <span className="text-[9px] text-muted-foreground font-medium uppercase">Edges</span>
            {EDGE_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <svg width="24" height="8" className="shrink-0" aria-hidden="true">
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

          {/* Nodes */}
          <div className="space-y-1">
            <span className="text-[9px] text-muted-foreground font-medium uppercase">Nodes</span>
            {NODE_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div
                  className="size-3.5 rounded shrink-0"
                  style={{
                    border: `2px ${item.style} ${item.border}`,
                    borderRadius: item.style === 'dashed' ? 6 : undefined,
                    background: 'var(--graph-node-body-bg)',
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
