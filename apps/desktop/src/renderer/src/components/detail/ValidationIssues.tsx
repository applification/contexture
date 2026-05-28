import type { ValidationError } from '@renderer/services/validation';
import { CircleAlert } from 'lucide-react';

export interface ValidationIssueRepair {
  label: string;
  onApply: () => void;
}

export function ValidationIssues({
  errors,
  onIssueClick,
  repairForIssue,
}: {
  errors: readonly ValidationError[];
  onIssueClick?: (error: ValidationError) => void;
  repairForIssue?: (error: ValidationError) => ValidationIssueRepair | null;
}) {
  if (errors.length === 0) return null;

  return (
    <section
      aria-label="Validation issues"
      className="space-y-1 rounded-md border border-destructive/35 bg-destructive/10 p-2 text-xs"
    >
      <div className="flex items-center gap-1.5 font-medium text-destructive">
        <CircleAlert aria-hidden="true" className="size-3.5" />
        {errors.length === 1 ? 'Validation issue' : 'Validation issues'}
      </div>
      <ul className="space-y-1 text-foreground/90">
        {errors.map((error) => {
          const repair = repairForIssue?.(error);
          return (
            <li key={`${error.code}:${error.path}`} className="flex items-start gap-2">
              {onIssueClick ? (
                <button
                  type="button"
                  onClick={() => onIssueClick(error)}
                  className="min-w-0 flex-1 text-left hover:underline"
                >
                  <span>{error.message}</span>
                  <span className="ml-1 text-muted-foreground/70">{error.path}</span>
                </button>
              ) : (
                <span className="min-w-0 flex-1">
                  <span>{error.message}</span>
                  <span className="ml-1 text-muted-foreground/70">{error.path}</span>
                </span>
              )}
              {repair && (
                <button
                  type="button"
                  onClick={repair.onApply}
                  className="shrink-0 rounded border border-border bg-background px-2 py-0.5 text-[11px] text-foreground hover:bg-muted"
                >
                  {repair.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
