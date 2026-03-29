import { BarChart3, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { useOntologyStore } from '@renderer/store/ontology';
import { computeMetrics } from '@renderer/services/metrics';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs tracking-wider uppercase text-muted-foreground pt-4 pb-1.5 px-4 font-medium">
      {children}
    </div>
  );
}

function MetricRow({
  label,
  value,
  warn,
  format,
}: {
  label: string;
  value: number;
  warn?: boolean;
  format?: 'percent' | 'decimal' | 'integer';
}) {
  const fmt = format ?? 'integer';
  let display: string;
  if (fmt === 'percent') display = `${(value * 100).toFixed(0)}%`;
  else if (fmt === 'decimal') display = value.toFixed(1);
  else display = String(value);

  return (
    <div className="flex items-center justify-between px-4 py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`text-sm font-medium ${warn ? 'text-warning flex items-center gap-1' : 'text-foreground'}`}
      >
        {warn && <TriangleAlert className="size-3" />}
        {display}
      </span>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-3 text-center flex-1 min-w-0">
      <div className="text-2xl font-semibold text-foreground tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5 truncate">{label}</div>
    </div>
  );
}

export function MetricsPanel(): React.JSX.Element {
  const ontology = useOntologyStore((s) => s.ontology);
  const hasContent = ontology.classes.size > 0;

  const metrics = useMemo(() => (hasContent ? computeMetrics(ontology) : null), [ontology, hasContent]);

  if (!hasContent || !metrics) {
    return (
      <Empty className="border-0 p-4">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BarChart3 />
          </EmptyMedia>
          <EmptyTitle className="text-sm font-medium">No ontology loaded</EmptyTitle>
          <EmptyDescription className="text-xs">
            Open a .ttl file to see ontology metrics.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const { summary, structure, connectivity, properties, coverage } = metrics;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-medium text-foreground">Ontology Metrics</h2>
      </div>

      {/* KPI Cards */}
      <div className="flex gap-2 px-4 pt-3">
        <KpiCard label="Classes" value={summary.totalClasses} />
        <KpiCard label="Obj Props" value={summary.objectProperties} />
        <KpiCard label="Data Props" value={summary.datatypeProperties} />
      </div>

      {/* Structure */}
      <SectionLabel>Structure</SectionLabel>
      <MetricRow label="Max depth" value={structure.maxDepth} />
      <MetricRow label="Avg breadth" value={structure.avgBreadth} format="decimal" />
      <MetricRow label="Root classes" value={structure.rootClasses} />
      <MetricRow label="Leaf classes" value={structure.leafClasses} />
      <MetricRow label="Orphan nodes" value={structure.orphanNodes} warn={structure.orphanNodes > 0} />
      <MetricRow
        label="Multi-parent classes"
        value={structure.multiParentClasses}
        warn={structure.multiParentClasses > 0}
      />

      {/* Connectivity */}
      <SectionLabel>Connectivity</SectionLabel>
      <MetricRow label="Avg degree" value={connectivity.avgDegree} format="decimal" />
      <MetricRow label="Max degree" value={connectivity.maxDegree} />
      <MetricRow label="Connected components" value={connectivity.connectedComponents} />
      <MetricRow
        label="Isolated classes"
        value={connectivity.isolatedClasses}
        warn={connectivity.isolatedClasses > 0}
      />
      <MetricRow
        label="Disjointness coverage"
        value={connectivity.disjointnessCoverage}
        format="percent"
      />

      {/* Properties */}
      <SectionLabel>Properties</SectionLabel>
      <MetricRow label="Obj/Datatype ratio" value={properties.objDatatypeRatio} format="decimal" />
      <MetricRow label="Avg props/class" value={properties.avgPropsPerClass} format="decimal" />
      <MetricRow label="Classes w/o props" value={properties.classesWithoutProps} />
      <MetricRow label="Inverse coverage" value={properties.inverseCoverage} format="percent" />
      <MetricRow
        label="Domain-less props"
        value={properties.domainlessProps}
        warn={properties.domainlessProps > 0}
      />
      <MetricRow
        label="Range-less obj props"
        value={properties.rangelessObjProps}
        warn={properties.rangelessObjProps > 0}
      />

      {/* Coverage */}
      <SectionLabel>Coverage</SectionLabel>
      <MetricRow label="Annotation coverage" value={coverage.annotationCoverage} format="percent" />
      <MetricRow
        label="Documentation coverage"
        value={coverage.documentationCoverage}
        format="percent"
      />

      <div className="h-4" />
    </div>
  );
}
