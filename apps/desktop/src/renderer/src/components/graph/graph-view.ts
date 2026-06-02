import type { BuildGraphResult } from './schema-to-graph';

export interface GraphViewOptions {
  showEnums: boolean;
  showStdlib: boolean;
}

export function filterGraphView(
  graph: BuildGraphResult,
  options: GraphViewOptions,
): BuildGraphResult {
  if (options.showEnums && options.showStdlib) return graph;
  const hiddenNodeIds = new Set(
    graph.nodes
      .filter(
        (node) =>
          (!options.showEnums && node.data.kind === 'enum' && !node.data.imported) ||
          (!options.showStdlib && node.data.stdlib === true),
      )
      .map((n) => n.id),
  );
  if (hiddenNodeIds.size === 0) return graph;
  return {
    nodes: graph.nodes.filter((node) => !hiddenNodeIds.has(node.id)),
    edges: graph.edges.filter(
      (edge) => !hiddenNodeIds.has(edge.source) && !hiddenNodeIds.has(edge.target),
    ),
  };
}
