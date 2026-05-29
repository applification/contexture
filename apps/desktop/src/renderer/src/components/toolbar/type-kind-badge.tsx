import type { CSSProperties } from 'react';

export type TypeKindLabel = 'object' | 'table' | 'enum' | 'union' | 'raw';

const KIND_BADGE_STYLES: Record<TypeKindLabel, CSSProperties> = {
  object: badgeStyle('var(--graph-node-header-bg)'),
  table: badgeStyle('var(--graph-node-table-accent)'),
  enum: badgeStyle('var(--chart-3)'),
  union: badgeStyle('var(--graph-edge-union)'),
  raw: badgeStyle('var(--muted-foreground)'),
};

export function TypeKindBadge({
  kind,
  title,
}: {
  kind: TypeKindLabel;
  title?: string;
}): React.JSX.Element {
  return (
    <span
      className="shrink-0 rounded border px-1.5 py-0 text-[9px] font-medium uppercase tracking-wide"
      style={KIND_BADGE_STYLES[kind]}
      title={title}
    >
      {kind}
    </span>
  );
}

function badgeStyle(color: string): CSSProperties {
  return {
    background: `color-mix(in oklch, ${color} 12%, transparent)`,
    borderColor: `color-mix(in oklch, ${color} 42%, var(--border))`,
    color: `color-mix(in oklch, ${color} 70%, var(--foreground))`,
  };
}
