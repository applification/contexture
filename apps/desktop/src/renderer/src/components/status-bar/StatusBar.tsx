import { getAnalyticsOptOut, setAnalyticsOptOut } from '@renderer/lib/analytics';
import { serializeToTurtle } from '@renderer/model/serialize';
import { estimateTokenCount } from '@renderer/services/tokens';
import { type ValidationError, validateOntology } from '@renderer/services/validation';
import { useOntologyStore } from '@renderer/store/ontology';
import { useUIStore } from '@renderer/store/ui';
import { BarChart3, Circle, CircleAlert, TriangleAlert } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

function localName(uri: string): string {
  const idx = Math.max(uri.lastIndexOf('#'), uri.lastIndexOf('/'));
  return idx >= 0 ? uri.substring(idx + 1) : uri;
}

export function StatusBar(): React.JSX.Element {
  const ontology = useOntologyStore((s) => s.ontology);
  const filePath = useOntologyStore((s) => s.filePath);
  const isDirty = useOntologyStore((s) => s.isDirty);
  const setSelectedNode = useUIStore((s) => s.setSelectedNode);
  const setSelectedEdge = useUIStore((s) => s.setSelectedEdge);

  const classCount = ontology.classes.size;
  const propCount = ontology.objectProperties.size + ontology.datatypeProperties.size;

  const tokenCount = useMemo(() => {
    if (classCount === 0) return 0;
    const turtle = serializeToTurtle(ontology);
    return estimateTokenCount(turtle);
  }, [ontology, classCount]);

  const errors = useMemo(() => validateOntology(ontology), [ontology]);
  const errorCount = errors.filter((e) => e.severity === 'error').length;
  const warnCount = errors.filter((e) => e.severity === 'warning').length;

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [analyticsOff, setAnalyticsOff] = useState(() => getAnalyticsOptOut());

  const toggleAnalytics = useCallback(() => {
    const newValue = !analyticsOff;
    setAnalyticsOptOut(newValue);
    setAnalyticsOff(newValue);
  }, [analyticsOff]);

  function handleErrorClick(error: ValidationError): void {
    if (error.elementType === 'class') {
      setSelectedNode(error.elementUri);
      setSelectedEdge(null);
    }
    setPopoverOpen(false);
  }

  const tokenDisplay = tokenCount > 0 ? `~${tokenCount.toLocaleString()} tokens` : '0 tokens';
  const hasIssues = errors.length > 0;

  return (
    <div
      className={cn(
        'h-7 border-t px-3 flex items-center text-xs gap-4 shrink-0 relative transition-colors duration-200',
        isDirty
          ? 'bg-warning/10 border-warning/30 text-warning-foreground'
          : 'bg-card border-border text-muted-foreground',
      )}
    >
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1.5">
              <Circle
                className={cn(
                  'size-2 shrink-0 transition-colors duration-200',
                  isDirty ? 'fill-warning text-warning' : 'fill-success/60 text-success/60',
                )}
              />
              <span>{isDirty ? 'Unsaved changes' : 'Saved'}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">
              {isDirty ? 'You have unsaved changes — press ⌘S to save' : 'All changes saved'}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {filePath && <span className="text-muted-foreground/60">{filePath}</span>}

      <span className="ml-auto flex items-center gap-4">
        {!hasIssues && classCount > 0 && <span className="text-success/60">No issues</span>}

        {hasIssues && (
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-destructive font-medium hover:text-destructive/80"
              >
                {errorCount > 0 && `${errorCount} error${errorCount !== 1 ? 's' : ''}`}
                {errorCount > 0 && warnCount > 0 && ' · '}
                {warnCount > 0 && `${warnCount} warning${warnCount !== 1 ? 's' : ''}`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-80" side="top" align="end">
              {errors.map((error) => (
                <button
                  type="button"
                  key={`${error.elementUri}-${error.message}`}
                  onClick={() => handleErrorClick(error)}
                  className="w-full text-left px-3 py-2 hover:bg-accent transition-colors flex gap-2 items-start border-b border-border last:border-0 text-xs"
                >
                  {error.severity === 'error' ? (
                    <CircleAlert className="size-3.5 shrink-0 mt-0.5 text-destructive" />
                  ) : (
                    <TriangleAlert className="size-3.5 shrink-0 mt-0.5 text-warning" />
                  )}
                  <span className="leading-relaxed">
                    <span className="text-muted-foreground font-medium">
                      {localName(error.elementUri)}:
                    </span>{' '}
                    <span className="text-foreground">{error.message}</span>
                  </span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}

        <span>
          {classCount} classes &middot; {propCount} properties &middot; {tokenDisplay}
        </span>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleAnalytics}
                className="flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <BarChart3 className={`size-3 ${analyticsOff ? 'opacity-40' : ''}`} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">
                {analyticsOff
                  ? 'Analytics disabled — click to enable'
                  : 'Analytics enabled — click to disable'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </span>
    </div>
  );
}
