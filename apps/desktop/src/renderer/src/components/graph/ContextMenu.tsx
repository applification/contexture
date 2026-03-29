import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export interface ContextMenuItem {
  label: string;
  action: () => void;
  destructive?: boolean;
  separator?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEsc(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      className="fixed z-50 min-w-[160px] bg-popover border border-border rounded-lg shadow-lg py-1 text-sm"
      style={{ left: x, top: y }}
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{ duration: 0.1, ease: 'easeOut' }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <Separator key={i} className="my-1" />
        ) : (
          <Button
            key={i}
            variant="ghost"
            className={`w-full justify-start px-3 h-8 rounded-none text-sm font-normal ${item.destructive ? 'text-destructive-foreground hover:text-destructive-foreground' : ''}`}
            onClick={() => {
              item.action();
              onClose();
            }}
          >
            {item.label}
          </Button>
        ),
      )}
    </motion.div>
  );
}
