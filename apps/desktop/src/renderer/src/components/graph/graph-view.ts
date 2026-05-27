import type { BuildGraphResult } from './schema-to-graph';

export interface GraphViewOptions {
  showEnums: boolean;
}

export function filterGraphView(
  graph: BuildGraphResult,
  options: GraphViewOptions,
): BuildGraphResult {
  if (options.showEnums) return graph;
  const hiddenNodeIds = new Set(
    graph.nodes.filter((node) => node.data.kind === 'enum' && !node.data.imported).map((n) => n.id),
  );
  if (hiddenNodeIds.size === 0) return graph;
  return {
    nodes: graph.nodes.filter((node) => !hiddenNodeIds.has(node.id)),
    edges: graph.edges.filter(
      (edge) => !hiddenNodeIds.has(edge.source) && !hiddenNodeIds.has(edge.target),
    ),
  };
}
