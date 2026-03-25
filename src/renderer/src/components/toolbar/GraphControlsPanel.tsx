import { X, Maximize2, RefreshCw } from 'lucide-react'
import { useUIStore } from '@renderer/store/ui'
import { getCyInstance } from '@renderer/components/graph/cyRef'
import { getLayoutOptions } from '@renderer/components/graph/layout'

interface Props {
  onClose: () => void
}

export function GraphControlsPanel({ onClose }: Props): React.JSX.Element {
  const graphFilters = useUIStore((s) => s.graphFilters)
  const graphLayout = useUIStore((s) => s.graphLayout)
  const setGraphFilter = useUIStore((s) => s.setGraphFilter)
  const setGraphLayout = useUIStore((s) => s.setGraphLayout)
  const resetGraphControls = useUIStore((s) => s.resetGraphControls)

  function handleRelayout(): void {
    getCyInstance()?.layout(getLayoutOptions(graphLayout)).run()
  }

  function handleFit(): void {
    getCyInstance()?.fit(undefined, 50)
  }

  function handleReset(): void {
    resetGraphControls()
    setTimeout(() => getCyInstance()?.layout(getLayoutOptions()).run(), 0)
  }

  return (
    <div
      className="absolute top-full left-0 mt-1 w-72 bg-popover border border-border rounded-lg shadow-lg z-50"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-foreground">Graph Controls</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-0.5 rounded">
          <X size={14} />
        </button>
      </div>

      <div className="px-3 py-2 space-y-1.5 border-b border-border">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Visibility</p>
        <FilterCheckbox
          label="Object properties"
          checked={graphFilters.showObjectProperties}
          onChange={(v) => setGraphFilter({ showObjectProperties: v })}
        />
        <FilterCheckbox
          label="Subclass edges"
          checked={graphFilters.showSubClassOf}
          onChange={(v) => setGraphFilter({ showSubClassOf: v })}
        />
        <FilterCheckbox
          label="Disjoint edges"
          checked={graphFilters.showDisjointWith}
          onChange={(v) => setGraphFilter({ showDisjointWith: v })}
        />
        <FilterCheckbox
          label="Datatype properties"
          checked={graphFilters.showDatatypeProperties}
          onChange={(v) => setGraphFilter({ showDatatypeProperties: v })}
        />
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-xs text-muted-foreground w-28">Min connections</span>
          <input
            type="range"
            min={0}
            max={10}
            value={graphFilters.minDegree}
            onChange={(e) => setGraphFilter({ minDegree: +e.target.value })}
            className="flex-1 accent-primary"
          />
          <span className="text-xs text-muted-foreground w-3 text-right">{graphFilters.minDegree}</span>
        </div>
      </div>

      <div className="px-3 py-2 space-y-1.5 border-b border-border">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Layout</p>
        <LayoutSlider
          label="Spacing"
          min={80}
          max={400}
          value={graphLayout.nodeSpacing}
          onChange={(v) => setGraphLayout({ nodeSpacing: v })}
        />
        <LayoutSlider
          label="Repulsion"
          min={1000}
          max={20000}
          step={500}
          value={graphLayout.repulsion}
          onChange={(v) => setGraphLayout({ repulsion: v })}
        />
        <LayoutSlider
          label="Gravity"
          min={0.05}
          max={1.0}
          step={0.05}
          value={graphLayout.gravity}
          onChange={(v) => setGraphLayout({ gravity: v })}
        />
        <button
          onClick={handleRelayout}
          className="w-full text-xs py-1 rounded-md bg-secondary text-foreground hover:bg-secondary/80 transition-colors mt-1"
        >
          Re-layout
        </button>
      </div>

      <div className="flex gap-2 px-3 py-2">
        <button
          onClick={handleFit}
          className="flex-1 text-xs py-1 rounded-md bg-secondary text-foreground hover:bg-secondary/80 transition-colors flex items-center justify-center gap-1"
        >
          <Maximize2 size={12} /> Fit to screen
        </button>
        <button
          onClick={handleReset}
          className="flex-1 text-xs py-1 rounded-md bg-secondary text-muted-foreground hover:bg-secondary/80 transition-colors flex items-center justify-center gap-1"
        >
          <RefreshCw size={12} /> Reset
        </button>
      </div>
    </div>
  )
}

function FilterCheckbox({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded accent-primary"
      />
      <span className="text-xs text-foreground">{label}</span>
    </label>
  )
}

function LayoutSlider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange
}: {
  label: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (v: number) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-16">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="flex-1 accent-primary"
      />
    </div>
  )
}
