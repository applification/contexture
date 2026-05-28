import type { ModelingHint } from '@contexture/core/modeling-hints';
import { Lightbulb } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Badge } from '../ui/badge';

interface ModelShapeHintsProps {
  hints: readonly ModelingHint[];
}

export function ModelShapeHints({ hints }: ModelShapeHintsProps) {
  if (hints.length === 0) return null;

  const [primary, ...secondary] = [...hints].sort(compareHints);
  if (!primary) return null;

  return (
    <section
      aria-label="Model shape"
      className="space-y-2.5 rounded border border-border/70 bg-muted/20 p-3 text-[12px] leading-5"
    >
      <div className="flex items-start gap-2">
        <Lightbulb aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 text-primary" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Model shape</h3>
            <span className="text-[11px] text-muted-foreground">Advisory</span>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Embed for ownership. Extract for identity.
          </p>
        </div>
      </div>

      <HintBody hint={primary} />

      {secondary.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            {secondary.length} more {secondary.length === 1 ? 'signal' : 'signals'}
          </summary>
          <div className="mt-2 space-y-2">
            {secondary.map((hint) => (
              <HintBody key={hint.id} hint={hint} compact />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function HintBody({ hint, compact = false }: { hint: ModelingHint; compact?: boolean }) {
  const tone = toneForHint(hint.kind);
  return (
    <div className={compact ? 'space-y-1 border-t border-border/70 pt-2' : 'space-y-2'}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          variant="outline"
          className="rounded px-1.5 py-0.5 text-[11px] font-medium leading-none"
          style={tone}
        >
          {hint.title}
        </Badge>
        {hint.fieldNames.map((fieldName) => (
          <Badge
            key={fieldName}
            variant="outline"
            className="rounded px-1.5 py-0.5 text-[11px] font-medium leading-none"
            style={fieldBadgeStyle}
          >
            {fieldName}
          </Badge>
        ))}
      </div>
      <p className="text-foreground/85">{hint.message}</p>
      {!compact && <p className="text-[12px] leading-5 text-muted-foreground">{hint.rationale}</p>}
    </div>
  );
}

const fieldBadgeStyle: CSSProperties = {
  background: 'color-mix(in oklch, var(--graph-edge-ref) 14%, transparent)',
  borderColor: 'color-mix(in oklch, var(--graph-edge-ref) 42%, transparent)',
  color: 'var(--characteristic-badge-text)',
};

function toneForHint(kind: ModelingHint['kind']): CSSProperties {
  switch (kind) {
    case 'possible_entity':
      return {
        background: 'color-mix(in oklch, var(--primary) 16%, transparent)',
        borderColor: 'color-mix(in oklch, var(--primary) 46%, transparent)',
        color: 'var(--primary)',
      };
    case 'query_handle':
      return {
        background: 'color-mix(in oklch, var(--graph-node-selected) 14%, transparent)',
        borderColor: 'color-mix(in oklch, var(--graph-node-selected) 55%, var(--foreground))',
        color: 'color-mix(in oklch, var(--graph-node-selected) 52%, var(--foreground))',
      };
    case 'embedded_collection':
      return {
        background: 'color-mix(in oklch, var(--graph-edge-union) 14%, transparent)',
        borderColor: 'color-mix(in oklch, var(--graph-edge-union) 46%, transparent)',
        color: 'var(--graph-edge-union)',
      };
    case 'owned_value_object':
      return {
        background: 'color-mix(in oklch, var(--success) 13%, transparent)',
        borderColor: 'color-mix(in oklch, var(--success) 40%, transparent)',
        color: 'var(--success)',
      };
  }
}

function compareHints(a: ModelingHint, b: ModelingHint): number {
  return hintRank(a) - hintRank(b) || a.id.localeCompare(b.id);
}

function hintRank(hint: ModelingHint): number {
  switch (hint.kind) {
    case 'possible_entity':
      return 0;
    case 'query_handle':
      return 1;
    case 'embedded_collection':
      return 2;
    case 'owned_value_object':
      return 3;
  }
}
