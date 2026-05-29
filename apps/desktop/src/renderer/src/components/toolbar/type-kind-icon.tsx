import { Box, GitBranch, ListChecks, Table2 } from 'lucide-react';
import type { TypeKindLabel } from './type-kind-badge';

export function TypeKindIcon({ kind }: { kind: TypeKindLabel }): React.JSX.Element | null {
  const className = 'size-4 shrink-0 text-muted-foreground';

  if (kind === 'table') return <Table2 className={className} aria-hidden="true" />;
  if (kind === 'object') return <Box className={className} aria-hidden="true" />;
  if (kind === 'enum') return <ListChecks className={className} aria-hidden="true" />;
  if (kind === 'union') return <GitBranch className={className} aria-hidden="true" />;
  return null;
}
