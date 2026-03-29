import { MousePointer2, MessageSquare, ClipboardList } from 'lucide-react';
import type { SidebarTab } from '@renderer/store/ui';
import { cn } from '@/lib/utils';

interface ActivityBarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
}

const TABS: Array<{ id: SidebarTab; icon: React.ReactNode; label: string }> = [
  { id: 'properties', icon: <MousePointer2 className="size-4" />, label: 'Properties' },
  { id: 'chat', icon: <MessageSquare className="size-4" />, label: 'Chat' },
  { id: 'eval', icon: <ClipboardList className="size-4" />, label: 'Eval' },
];

export function ActivityBar({ activeTab, onTabChange }: ActivityBarProps): React.JSX.Element {
  return (
    <div className="w-10 flex flex-col items-center py-2 gap-1 border-l border-border bg-background shrink-0">
      {TABS.map(({ id, icon, label }) => (
        <button
          key={id}
          title={label}
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
