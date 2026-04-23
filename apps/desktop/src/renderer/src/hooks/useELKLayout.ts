import type { GraphLayout } from '@renderer/store/layout-config';
import type { Edge, Node } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { useCallback, useRef } from 'react';

const elk = new ELK();

export interface ELKLayoutResult {
  id: string;
  x: number;
  y: number;
}

/**
 * Build ELK layout options that scale with graph size.
 * Small graphs (≤100 nodes) use stress minimization for organic results.
 * Medium graphs (101-300) use stress with reduced iterations.
 * Large graphs (>300) switch to the much faster layered algorithm.
 */
function buildLayoutOptions(nodeCount: number, nodeGap: number): Record<string, string> {
  if (nodeCount > 300) {
    // Layered (Sugiyama) — O(n log n), handles 1000+ nodes comfortably
    return {
      'elk.algorithm': 'org.eclipse.elk.layered',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(nodeGap * 1.5),
      'elk.spacing.nodeNode': String(nodeGap),
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.padding': '[top=50, left=50, bottom=50, right=50]',
      'elk.edgeRouting': 'SPLINES',
    };
  }

  // Stress minimization — organic look, but scales O(n²)
  const iterationLimit = nodeCount > 100 ? 150 : 300;
  const epsilon = nodeCount > 100 ? '5e-3' : '1e-3';

  return {
    'elk.algorithm': 'org.eclipse.elk.stress',
    'elk.stress.desiredEdgeLength': String(nodeGap * 2),
    'elk.stress.epsilon': epsilon,
    'elk.stress.iterationLimit': String(iterationLimit),
    'elk.spacing.nodeNode': String(nodeGap),
    'elk.padding': '[top=50, left=50, bottom=50, right=50]',
  };
}

export function useELKLayout() {
  const runningRef = useRef(false);

  const runLayout = useCallback(
    async (
      nodes: Node[],
      edges: Edge[],
      layout?: Partial<GraphLayout>,
    ): Promise<ELKLayoutResult[]> => {
      if (runningRef.current) return [];
      runningRef.current = true;

      const nodeGap = layout?.nodeSpacing ?? 180;
      const layoutChildren = nodes
        .filter((n) => n.type !== 'group')
        .map((n) => ({
          id: n.id,
          width: n.measured?.width ?? 200,
          height: n.measured?.height ?? 48,
        }));

      const elkGraph = {
        id: 'root',
        layoutOptions: buildLayoutOptions(layoutChildren.length, nodeGap),
        children: layoutChildren,
        edges: edges.map((e) => ({
          id: e.id,
          sources: [e.source],
          targets: [e.target],
        })),
      };

      try {
        const result = await elk.layout(elkGraph);
        return (result.children ?? []).map((child: { id: string; x?: number; y?: number }) => ({
          id: child.id,
          x: child.x ?? 0,
          y: child.y ?? 0,
        }));
      } finally {
        runningRef.current = false;
      }
    },
    [],
  );

  return { runLayout };
}
