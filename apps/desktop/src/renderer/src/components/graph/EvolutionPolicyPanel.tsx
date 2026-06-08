import { describeEvolutionPolicy, type EvolutionPolicy } from '@contexture/core/evolution-policy';
import {
  ChevronDown,
  ChevronUp,
  type LucideIcon,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface EvolutionPolicyPanelProps {
  policy: EvolutionPolicy;
  onChange: (policy: EvolutionPolicy) => void;
}

const POLICY_OPTIONS: Array<{
  value: EvolutionPolicy;
  label: string;
  summary: string;
  impact: string;
  icon: LucideIcon;
}> = [
  {
    value: 'preserveData',
    label: 'Preserve data',
    summary: 'Assume real data may exist.',
    impact: 'Agents prefer additive, migration-aware changes and call out destructive risk.',
    icon: ShieldCheck,
  },
  {
    value: 'resettable',
    label: 'Resettable',
    summary: 'Data can be dropped or regenerated.',
    impact: 'Agents can propose breaking remodels, with a brief reset-impact note.',
    icon: RotateCcw,
  },
  {
    value: 'scratch',
    label: 'Scratch',
    summary: 'No meaningful data is expected.',
    impact: 'Agents can freely rename, delete, restructure, or replace the model.',
    icon: Sparkles,
  },
];

export function EvolutionPolicyPanel({
  policy,
  onChange,
}: EvolutionPolicyPanelProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const current = describeEvolutionPolicy(policy);
  const currentOption =
    POLICY_OPTIONS.find((option) => option.value === policy) ?? POLICY_OPTIONS[0];
  const CurrentIcon = currentOption.icon;

  return (
    <section
      aria-label="Evolution policy"
      className="overflow-hidden rounded-xl border border-border/80 bg-card/95 text-xs text-card-foreground shadow-sm backdrop-blur"
    >
      <button
        type="button"
        className={cn(
          'flex h-[38px] w-full min-w-44 items-center justify-between gap-3 px-3 text-xs font-medium transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          policy === 'preserveData' ? 'text-muted-foreground' : 'bg-secondary text-foreground',
        )}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse evolution policy' : 'Expand evolution policy'}
        title={`Evolution policy: ${current.label}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="grid size-5 shrink-0 place-items-center rounded-md border border-primary/35 bg-primary/15 text-primary"
            aria-hidden="true"
          >
            <CurrentIcon className="size-3.5" />
          </span>
          <span className="truncate">Evolution Policy</span>
        </span>
        {expanded ? (
          <ChevronUp className="size-3.5" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3.5" aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <div className="w-80 border-t border-border/70">
          <div className="border-b border-border/70 px-3 py-2.5">
            <div className="text-[10px] font-semibold text-muted-foreground">Current posture</div>
            <p className="mt-1 text-xs leading-relaxed text-foreground">{current.guidance}</p>
          </div>

          <fieldset className="grid gap-1.5 px-2 py-2" aria-label="Evolution policy options">
            {POLICY_OPTIONS.map((option) => {
              const selected = option.value === policy;
              const OptionIcon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'grid gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    selected
                      ? 'border-primary/45 bg-primary/20 text-primary hover:bg-primary/25 hover:text-primary'
                      : 'border-transparent text-muted-foreground hover:border-border hover:bg-primary/10 hover:text-primary',
                  )}
                  aria-pressed={selected}
                  onClick={() => onChange(option.value)}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'grid size-5 shrink-0 place-items-center rounded-md border',
                          selected
                            ? 'border-primary/45 bg-primary/15 text-primary'
                            : 'border-current/50 bg-background/35 text-current',
                        )}
                      >
                        <OptionIcon className="size-3.5" />
                      </span>
                      <span className="text-xs font-medium">{option.label}</span>
                    </span>
                    {selected && (
                      <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        Active
                      </span>
                    )}
                  </span>
                  <span className="pl-7 text-[11px] leading-snug">{option.summary}</span>
                  <span
                    className={cn(
                      'pl-7 text-[11px] leading-snug',
                      selected ? 'text-primary/80' : 'text-muted-foreground',
                    )}
                  >
                    {option.impact}
                  </span>
                </button>
              );
            })}
          </fieldset>
        </div>
      )}
    </section>
  );
}
