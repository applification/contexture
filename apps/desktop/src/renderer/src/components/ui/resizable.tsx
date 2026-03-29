import { GripVertical } from 'lucide-react';
import {
  Group,
  type GroupProps,
  Panel,
  Separator,
  type SeparatorProps,
} from 'react-resizable-panels';

export const ResizablePanelGroup = ({ className = '', ...props }: GroupProps) => (
  <Group className={`flex h-full w-full ${className}`} {...props} />
);

export const ResizablePanel = Panel;

export const ResizableHandle = ({ className = '', ...props }: SeparatorProps) => (
  <Separator
    className={`relative flex w-1 items-center justify-center bg-border hover:bg-ring transition-colors after:absolute after:inset-y-0 after:-left-1.5 after:-right-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-col-resize ${className}`}
    {...props}
  >
    <div className="z-10 flex h-6 w-3.5 items-center justify-center rounded-sm border bg-border">
      <GripVertical className="h-3 w-3 text-muted-foreground" />
    </div>
  </Separator>
);
