import type { ValidationError } from '@renderer/services/validation';
import { CircleAlert } from 'lucide-react';
import { Button } from '../ui/button';

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
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onIssueClick(error)}
                  className="h-auto min-h-8 min-w-0 flex-1 justify-start px-1.5 py-1 text-left text-xs hover:bg-destructive/10"
                >
                  <span className="whitespace-normal">
                    <span>{error.message}</span>
                    <span className="ml-1 text-muted-foreground/70">{error.path}</span>
                  </span>
                </Button>
              ) : (
                <span className="min-w-0 flex-1">
                  <span>{error.message}</span>
                  <span className="ml-1 text-muted-foreground/70">{error.path}</span>
                </span>
              )}
              {repair && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={repair.onApply}
                  className="h-8 shrink-0 px-2 text-[11px]"
                >
                  {repair.label}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
