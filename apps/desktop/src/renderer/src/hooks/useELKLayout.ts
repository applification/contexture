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
 * Build ELK layout options that scale with graph size and user intent.
 * Organic uses stress minimization for a loose map. Layered uses the
 * Sugiyama pipeline, which is better for crossing reduction in directed
 * schema relationships.
 */
export function buildLayoutOptions(
  nodeCount: number,
  nodeGap: number,
  layout?: Partial<GraphLayout>,
): Record<string, string> {
  const layoutMode = layout?.layoutMode ?? 'layered';

  if (layoutMode === 'layered' || nodeCount > 300) {
    const layerGap = Math.round(nodeGap * 1.6);
    return {
      'elk.algorithm': 'org.eclipse.elk.layered',
      'elk.direction': 'RIGHT',
      'elk.padding': '[top=50, left=50, bottom=50, right=50]',
      'elk.spacing.nodeNode': String(nodeGap),
      'elk.edgeRouting': 'SPLINES',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(layerGap),
      'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.thoroughness': '20',
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
        layoutOptions: buildLayoutOptions(layoutChildren.length, nodeGap, layout),
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
