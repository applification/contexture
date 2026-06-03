import type { SidebarTab } from '@renderer/store/ui-chrome';
import {
  BookOpen,
  FileBracesCorner,
  FlaskConical,
  History,
  ListChecks,
  MessageSquare,
  MousePointer2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActivityBarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
}

const TABS: Array<{ id: SidebarTab; icon: React.ReactNode; label: string }> = [
  { id: 'properties', icon: <MousePointer2 className="size-4" />, label: 'Properties' },
  { id: 'chat', icon: <MessageSquare className="size-4" />, label: 'Chat' },
  { id: 'review', icon: <ListChecks className="size-4" />, label: 'Review' },
  { id: 'changes', icon: <History className="size-4" />, label: 'Changes' },
  { id: 'schema', icon: <FileBracesCorner className="size-4" />, label: 'Schema' },
  { id: 'playground', icon: <FlaskConical className="size-4" />, label: 'Playground' },
  { id: 'stdlib', icon: <BookOpen className="size-4" />, label: 'Stdlib' },
];

export function ActivityBar({ activeTab, onTabChange }: ActivityBarProps): React.JSX.Element {
  return (
    <div className="w-10 flex flex-col items-center py-2 gap-1 border-l border-border bg-background shrink-0">
      {TABS.map(({ id, icon, label }) => (
        <button
          type="button"
          key={id}
          title={label}
          aria-label={label}
          onClick={() => onTabChange(id)}
          className={cn(
            'relative w-8 h-8 rounded-md flex items-center justify-center transition-colors',
            activeTab === id
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
        >
          {activeTab === id && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
          )}
          {icon}
        </button>
      ))}
    </div>
  );
}
