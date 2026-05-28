import type { RefEdgeData } from './schema-to-graph';

export const TYPE_EDGE_SELECT_EVENT = 'contexture:edge-select';

export interface EdgeSelection {
  edgeId: string;
  data: RefEdgeData;
}
