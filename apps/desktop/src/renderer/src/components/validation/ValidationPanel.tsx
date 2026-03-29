import { type ValidationError, validateOntology } from '@renderer/services/validation';
import { useOntologyStore } from '@renderer/store/ontology';
import { useUIStore } from '@renderer/store/ui';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';

function localName(uri: string): string {
  const idx = Math.max(uri.lastIndexOf('#'), uri.lastIndexOf('/'));
  return idx >= 0 ? uri.substring(idx + 1) : uri;
}

export function ValidationPanel(): React.JSX.Element {
  const ontology = useOntologyStore((s) => s.ontology);
  const setSelectedNode = useUIStore((s) => s.setSelectedNode);
  const setSelectedEdge = useUIStore((s) => s.setSelectedEdge);

  const errors = useMemo(() => validateOntology(ontology), [ontology]);

  const errorCount = errors.filter((e) => e.severity === 'error').length;
  const warnCount = errors.filter((e) => e.severity === 'warning').length;

  function handleClick(error: ValidationError): void {
    if (error.elementType === 'class') {
      setSelectedNode(error.elementUri);
      setSelectedEdge(null);
    }
  }

  if (errors.length === 0) {
    return <div className="p-3 text-xs text-muted-foreground">No validation issues</div>;
  }

  return (
    <div className="text-xs">
      <div className="px-3 py-1.5 text-muted-foreground border-b border-border">
        {errorCount > 0 && <span className="text-destructive">{errorCount} errors</span>}
        {errorCount > 0 && warnCount > 0 && ' · '}
        {warnCount > 0 && <span>{warnCount} warnings</span>}
      </div>
      <div className="max-h-40 overflow-y-auto">
        {errors.map((error) => (
          <Button
            key={`${error.elementUri}-${error.message}`}
            variant="ghost"
            className="w-full justify-start px-3 h-auto py-1.5 gap-2 items-start rounded-none text-xs font-normal"
            onClick={() => handleClick(error)}
          >
            {error.severity === 'error' ? (
              <CircleAlert className="size-3.5 shrink-0 mt-0.5 text-destructive" />
            ) : (
              <TriangleAlert className="size-3.5 shrink-0 mt-0.5 text-warning" />
            )}
            <span className="text-left">
              <span className="text-muted-foreground">{localName(error.elementUri)}:</span>{' '}
              {error.message}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
