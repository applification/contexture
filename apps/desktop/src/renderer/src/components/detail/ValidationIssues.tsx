import type { ValidationError } from '@renderer/services/validation';
import { CircleAlert, MessageSquare } from 'lucide-react';
import { Button } from '../ui/button';

export interface ValidationIssueRepair {
  label: string;
  onApply: () => void;
}

export function ValidationIssues({
  errors,
  onDiscussIssue,
  onIssueClick,
  repairForIssue,
}: {
  errors: readonly ValidationError[];
  onDiscussIssue?: (error: ValidationError) => void;
  onIssueClick?: (error: ValidationError) => void;
  repairForIssue?: (error: ValidationError) => ValidationIssueRepair | null;
}) {
  if (errors.length === 0) return null;

  const hasErrors = errors.some((error) => error.severity === 'error');
  const tone = hasErrors ? 'destructive' : 'warning';
  const title = hasErrors
    ? errors.length === 1
      ? 'Validation issue'
      : 'Validation issues'
    : errors.length === 1
      ? 'Advisory'
      : 'Advisories';

  return (
    <section
      aria-label="Validation issues"
      className={`space-y-1 rounded-md border p-2 text-xs ${
        tone === 'destructive'
          ? 'border-destructive/35 bg-destructive/10'
          : 'border-warning/35 bg-warning/10'
      }`}
    >
      <div
        className={`flex items-center gap-1.5 font-medium ${
          tone === 'destructive' ? 'text-destructive' : 'text-warning'
        }`}
      >
        <CircleAlert aria-hidden="true" className="size-3.5" />
        {title}
      </div>
      <ul className="space-y-1 text-foreground/90">
        {errors.map((error) => {
          const repair = repairForIssue?.(error);
          const hoverClass =
            error.severity === 'error' ? 'hover:bg-destructive/10' : 'hover:bg-warning/10';
          return (
            <li key={`${error.code}:${error.path}`} className="space-y-1.5">
              {onIssueClick ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onIssueClick(error)}
                  className={`h-auto min-h-8 w-full justify-start px-1.5 py-1 text-left text-xs ${hoverClass}`}
                >
                  <span className="whitespace-normal">
                    <span className="block font-mono text-[10px] text-muted-foreground/80">
                      {error.code}
                    </span>
                    <span>{error.message}</span>
                    <span className="ml-1 text-muted-foreground/70">{error.path}</span>
                  </span>
                </Button>
              ) : (
                <span className="block min-w-0 px-1.5 py-1">
                  <span className="block font-mono text-[10px] text-muted-foreground/80">
                    {error.code}
                  </span>
                  <span>{error.message}</span>
                  <span className="ml-1 text-muted-foreground/70">{error.path}</span>
                </span>
              )}
              {(repair || onDiscussIssue) && (
                <div className="flex justify-end gap-1.5">
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
                  {onDiscussIssue && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onDiscussIssue(error)}
                      className="h-8 shrink-0 gap-1 px-2 text-[11px]"
                    >
                      <MessageSquare aria-hidden="true" className="size-3" />
                      Discuss in chat
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
