/**
 * Graph controls popover — node-spacing slider + re-layout / fit / reset.
 *
 * Pre-pivot had a stack of visibility filters (subClassOf, disjointWith,
 * object properties, individuals, restrictions, …). None of those map
 * to Contexture's two-kind edge model (`ref` + future `crossBoundary`),
 * so the filter block is deliberately omitted. If Contexture grows
 * more edge kinds the filter UI can come back alongside them.
 *
 * The panel talks to the canvas over two custom DOM events:
 *
 *   - `graph:relayout` — re-run ELK on the current nodes/edges.
 *   - `graph:fitview` — frame everything in view.
 *
 * `GraphCanvas` subscribes to both. Keeping them as bus events (not
 * imperative refs) means the popover doesn't need to know where the
 * canvas is mounted.
 */
import { useGraphLayoutStore } from '@renderer/store/layout-config';
import { Maximize2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface Props {
  onClose: () => void;
}

export function GraphControlsPanel({ onClose }: Props): React.JSX.Element {
  const graphLayout = useGraphLayoutStore((s) => s.graphLayout);
  const setGraphLayout = useGraphLayoutStore((s) => s.setGraphLayout);
  const resetGraphControls = useGraphLayoutStore((s) => s.resetToDefaults);

  function handleRelayout(): void {
    document.dispatchEvent(new CustomEvent('graph:relayout'));
  }

  function handleFit(): void {
    document.dispatchEvent(new CustomEvent('graph:fitview'));
  }

  function handleReset(): void {
    resetGraphControls();
    // Defer to the next tick so the store update has propagated before
    // the canvas picks up the new spacing.
    setTimeout(() => document.dispatchEvent(new CustomEvent('graph:relayout')), 0);
  }

  return (
    <div>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-foreground">Graph Controls</span>
        <Button variant="ghost" size="icon" className="size-6" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="px-3 py-2 space-y-1.5 border-b border-border">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Layout
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-16">Spacing</span>
          <Slider
            min={80}
            max={400}
            step={1}
            value={[graphLayout.nodeSpacing]}
            onValueChange={([v]) => setGraphLayout({ nodeSpacing: v })}
            onValueCommit={handleRelayout}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-10 text-right">
            {graphLayout.nodeSpacing}
          </span>
        </div>
      </div>

      <div className="flex gap-2 px-3 py-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 h-7 text-xs gap-1"
          onClick={handleRelayout}
          title="Run ELK auto-layout"
        >
          <RefreshCw className="size-3" /> Re-layout
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 h-7 text-xs gap-1"
          onClick={handleFit}
          title="Fit everything to screen"
        >
          <Maximize2 className="size-3" /> Fit
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 h-7 text-xs gap-1"
          onClick={handleReset}
          title="Reset spacing and re-layout"
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
