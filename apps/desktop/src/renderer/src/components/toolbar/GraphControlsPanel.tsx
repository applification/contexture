import { useUIStore } from '@renderer/store/ui';
import { Maximize2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

interface Props {
  onClose: () => void;
}

export function GraphControlsPanel({ onClose }: Props): React.JSX.Element {
  const graphFilters = useUIStore((s) => s.graphFilters);
  const graphLayout = useUIStore((s) => s.graphLayout);
  const setGraphFilter = useUIStore((s) => s.setGraphFilter);
  const setGraphLayout = useUIStore((s) => s.setGraphLayout);
  const resetGraphControls = useUIStore((s) => s.resetGraphControls);

  function handleRelayout(): void {
    document.dispatchEvent(new CustomEvent('graph:relayout'));
  }

  function handleFit(): void {
    document.dispatchEvent(new CustomEvent('graph:fitview'));
  }

  function handleReset(): void {
    resetGraphControls();
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
          Visibility
        </p>
        <FilterCheckbox
          id="filter-object-props"
          label="Object properties"
          checked={graphFilters.showObjectProperties}
          onChange={(v) => setGraphFilter({ showObjectProperties: v })}
        />
        <FilterCheckbox
          id="filter-subclass"
          label="Subclass edges"
          checked={graphFilters.showSubClassOf}
          onChange={(v) => setGraphFilter({ showSubClassOf: v })}
        />
        <FilterCheckbox
          id="filter-disjoint"
          label="Disjoint edges"
          checked={graphFilters.showDisjointWith}
          onChange={(v) => setGraphFilter({ showDisjointWith: v })}
        />
        <FilterCheckbox
          id="filter-datatype-props"
          label="Datatype properties"
          checked={graphFilters.showDatatypeProperties}
          onChange={(v) => setGraphFilter({ showDatatypeProperties: v })}
        />
        <FilterCheckbox
          id="filter-individuals"
          label="Individuals"
          checked={graphFilters.showIndividuals}
          onChange={(v) => setGraphFilter({ showIndividuals: v })}
        />
        <FilterCheckbox
          id="filter-typeof"
          label="Type-of edges"
          checked={graphFilters.showTypeOf}
          onChange={(v) => setGraphFilter({ showTypeOf: v })}
        />
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-xs text-muted-foreground w-28">Min connections</span>
          <Slider
            min={0}
            max={10}
            step={1}
            value={[graphFilters.minDegree]}
            onValueChange={([v]) => setGraphFilter({ minDegree: v })}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-3 text-right">
            {graphFilters.minDegree}
          </span>
        </div>
      </div>

      <div className="px-3 py-2 space-y-1.5 border-b border-border">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Layout
        </p>
        <LayoutSlider
          label="Spacing"
          min={80}
          max={400}
          value={graphLayout.nodeSpacing}
          onChange={(v) => setGraphLayout({ nodeSpacing: v })}
          onCommit={() => handleRelayout()}
        />
      </div>

      <div className="flex gap-2 px-3 py-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 h-7 text-xs gap-1"
          onClick={handleFit}
        >
          <Maximize2 className="size-3" /> Fit to screen
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 h-7 text-xs gap-1"
          onClick={handleReset}
        >
          <RefreshCw className="size-3" /> Reset
        </Button>
      </div>
    </div>
  );
}

function FilterCheckbox({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v as boolean)} />
      <Label htmlFor={id} className="text-xs text-foreground cursor-pointer font-normal">
        {label}
      </Label>
    </div>
  );
}

function LayoutSlider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-16">{label}</span>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        onValueCommit={onCommit}
        className="flex-1"
      />
    </div>
  );
}
