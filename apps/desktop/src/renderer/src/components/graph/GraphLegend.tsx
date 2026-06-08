/**
 * Canvas legend.
 *
 * Mirrors the current graph vocabulary: compact type badges, relationship
 * strokes from `RefEdge`, and the few field cues that are otherwise easy
 * to miss on first use.
 */
import {
  Box,
  ChevronDown,
  ChevronUp,
  Code2,
  GitBranch,
  ListChecks,
  Map as MapIcon,
  Table2,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { memo, useState } from 'react';
import { cn } from '@/lib/utils';
import { TypeKindBadge, type TypeKindLabel } from '../toolbar/type-kind-badge';

interface EdgeItem {
  label: string;
  description: string;
  color: string;
  dash?: string;
}

const EDGE_ITEMS: readonly EdgeItem[] = [
  {
    label: 'Field ref',
    description: 'A ref field points at another type.',
    color: 'var(--graph-edge-fk)',
  },
  {
    label: 'Inferred id',
    description: 'A table id field was recognized from the model.',
    color: 'var(--graph-edge-import)',
    dash: '6 4',
  },
  {
    label: 'Union variant',
    description: 'A discriminated union includes this variant.',
    color: 'var(--graph-edge-union)',
    dash: '2 4',
  },
  {
    label: 'Active path',
    description: 'Selection, adjacency, or preview focus.',
    color: 'var(--graph-edge-active)',
  },
];

interface TypeItem {
  kind: TypeKindLabel;
  label: string;
  icon: React.JSX.Element | null;
}

const BASE_TYPE_ITEMS: readonly TypeItem[] = [
  { kind: 'object', label: 'Object', icon: <Box className="size-3.5" aria-hidden="true" /> },
  { kind: 'table', label: 'Table', icon: <Table2 className="size-3.5" aria-hidden="true" /> },
  { kind: 'union', label: 'Union', icon: <GitBranch className="size-3.5" aria-hidden="true" /> },
  { kind: 'raw', label: 'Raw', icon: <Code2 className="size-3.5" aria-hidden="true" /> },
];

const ENUM_TYPE_ITEM: TypeItem = {
  kind: 'enum',
  label: 'Enum',
  icon: <ListChecks className="size-3.5" aria-hidden="true" />,
};

export const GraphLegend = memo(function GraphLegend({
  showStdlibNodes = false,
  showRawTypes = false,
  showImportedNodes = false,
  className,
}: {
  showEnumNodes?: boolean;
  showStdlibNodes?: boolean;
  showRawTypes?: boolean;
  showImportedNodes?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeItems = [BASE_TYPE_ITEMS[0], BASE_TYPE_ITEMS[1], ENUM_TYPE_ITEM, BASE_TYPE_ITEMS[2]];
  if (showRawTypes) typeItems.push(BASE_TYPE_ITEMS[3]);

  return (
    <section
      aria-label="Graph legend"
      className={cn(
        'overflow-hidden rounded-xl border border-border/80 bg-card/95 text-xs text-card-foreground shadow-sm backdrop-blur',
        className,
      )}
    >
      <button
        type="button"
        className="flex h-[38px] w-full min-w-32 items-center justify-between gap-3 px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse legend' : 'Expand legend'}
      >
        <span className="flex min-w-0 items-center gap-2">
          <MapIcon className="size-4" aria-hidden="true" />
          <span>Legend</span>
        </span>
        {expanded ? (
          <ChevronUp className="size-3.5" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3.5" aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <div className="w-72 border-t border-border/70">
          <LegendSection title="Types">
            <div className="grid grid-cols-2 gap-1.5">
              {typeItems.map((item) => (
                <TypeLegendItem key={item.kind} item={item} />
              ))}
              {showStdlibNodes && (
                <div className="flex min-w-0 items-center gap-2 rounded-md border border-dashed border-border bg-background/55 px-2 py-1.5">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full"
                    style={{
                      background:
                        'color-mix(in oklch, var(--chart-2) 72%, var(--graph-node-header-bg))',
                    }}
                  />
                  <span className="truncate text-foreground">Stdlib</span>
                </div>
              )}
              {showImportedNodes && (
                <div className="flex min-w-0 items-center gap-2 rounded-md border border-dashed border-border bg-background/55 px-2 py-1.5">
                  <span
                    aria-hidden="true"
                    className="h-3 w-4 shrink-0 rounded-sm border border-dashed border-muted-foreground/80"
                  />
                  <span className="truncate text-foreground">Imported</span>
                </div>
              )}
            </div>
          </LegendSection>

          <LegendSection title="Relationships">
            <div className="space-y-1">
              {EDGE_ITEMS.map((item) => (
                <EdgeLegendItem key={item.label} item={item} />
              ))}
            </div>
          </LegendSection>

          <LegendSection title="Fields" last>
            <div className="grid gap-1.5">
              <FieldCue
                sample="-> Customer"
                label="Object ref"
                style={{ color: 'var(--graph-edge-property)' }}
              />
              <FieldCue
                sample="-> Event · union"
                label="Union ref"
                style={{ color: 'var(--graph-edge-property)' }}
              />
              <FieldCue
                sample="Status enum"
                label="Inline enum"
                style={{
                  color: 'var(--muted-foreground)',
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>
          </LegendSection>
        </div>
      )}
    </section>
  );
});

function LegendSection({
  title,
  children,
  last = false,
}: {
  title: string;
  children: ReactNode;
  last?: boolean;
}): React.JSX.Element {
  return (
    <div className={last ? 'px-3 py-2.5' : 'border-b border-border/70 px-3 py-2.5'}>
      <div className="mb-2 text-[10px] font-semibold text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function TypeLegendItem({ item }: { item: TypeItem }): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md bg-background/55 px-2 py-1.5">
      <span className="flex shrink-0 items-center text-foreground" title={item.label}>
        {item.icon}
      </span>
      <TypeKindBadge kind={item.kind} />
    </div>
  );
}

function EdgeLegendItem({ item }: { item: EdgeItem }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-2 rounded-md px-1 py-1">
      <svg width="36" height="10" className="shrink-0" aria-hidden="true">
        <line
          x1="1"
          y1="5"
          x2="35"
          y2="5"
          stroke={item.color}
          strokeWidth="2"
          strokeDasharray={item.dash}
          strokeLinecap="round"
        />
      </svg>
      <div className="min-w-0">
        <div className="truncate text-foreground">{item.label}</div>
        <div className="truncate text-[10px] text-muted-foreground">{item.description}</div>
      </div>
    </div>
  );
}

function FieldCue({
  sample,
  label,
  style,
}: {
  sample: string;
  label: string;
  style: CSSProperties;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-background/55 px-2 py-1.5">
      <span className="min-w-0 truncate text-[10px]" style={style}>
        {sample}
      </span>
      <span className="shrink-0 text-foreground">{label}</span>
    </div>
  );
}
