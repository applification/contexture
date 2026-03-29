import { useUIStore } from '@renderer/store/ui';
import { beforeEach, describe, expect, it } from 'vitest';

function resetStore() {
  useUIStore.setState({
    selectedNodeId: null,
    selectedEdgeId: null,
    adjacentNodeIds: [],
    adjacentEdgeIds: [],
    theme: 'dark',
    chatOpen: true,
    sidebarVisible: true,
    graphFilters: {
      showSubClassOf: true,
      showDisjointWith: true,
      showObjectProperties: true,
      showDatatypeProperties: true,
      minDegree: 0,
    },
    graphLayout: { nodeSpacing: 180 },
    focusNodeId: null,
    sidebarTab: 'chat',
    chatDraft: '',
    pendingChatMessage: null,
  });
}

describe('useUIStore', () => {
  beforeEach(resetStore);

  it('sets selected node', () => {
    useUIStore.getState().setSelectedNode('node-1');
    expect(useUIStore.getState().selectedNodeId).toBe('node-1');
  });

  it('sets selected edge', () => {
    useUIStore.getState().setSelectedEdge('edge-1');
    expect(useUIStore.getState().selectedEdgeId).toBe('edge-1');
  });

  it('sets adjacency', () => {
    useUIStore.getState().setAdjacency(['n1', 'n2'], ['e1']);
    expect(useUIStore.getState().adjacentNodeIds).toEqual(['n1', 'n2']);
    expect(useUIStore.getState().adjacentEdgeIds).toEqual(['e1']);
  });

  it('toggles theme', () => {
    expect(useUIStore.getState().theme).toBe('dark');
    useUIStore.getState().toggleTheme();
    expect(useUIStore.getState().theme).toBe('light');
    useUIStore.getState().toggleTheme();
    expect(useUIStore.getState().theme).toBe('dark');
  });

  it('sets chat open', () => {
    useUIStore.getState().setChatOpen(false);
    expect(useUIStore.getState().chatOpen).toBe(false);
  });

  it('toggles sidebar', () => {
    expect(useUIStore.getState().sidebarVisible).toBe(true);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarVisible).toBe(false);
  });

  it('sets sidebar visible', () => {
    useUIStore.getState().setSidebarVisible(false);
    expect(useUIStore.getState().sidebarVisible).toBe(false);
  });

  it('sets graph filter', () => {
    useUIStore.getState().setGraphFilter({ showDisjointWith: false, minDegree: 2 });
    const filters = useUIStore.getState().graphFilters;
    expect(filters.showDisjointWith).toBe(false);
    expect(filters.minDegree).toBe(2);
    expect(filters.showSubClassOf).toBe(true); // unchanged
  });

  it('sets graph layout', () => {
    useUIStore.getState().setGraphLayout({ nodeSpacing: 300 });
    expect(useUIStore.getState().graphLayout.nodeSpacing).toBe(300);
  });

  it('resets graph controls', () => {
    useUIStore.getState().setGraphFilter({ minDegree: 5 });
    useUIStore.getState().setGraphLayout({ nodeSpacing: 999 });
    useUIStore.getState().resetGraphControls();
    expect(useUIStore.getState().graphFilters.minDegree).toBe(0);
    expect(useUIStore.getState().graphLayout.nodeSpacing).toBe(180);
  });

  it('sets focus node', () => {
    useUIStore.getState().setFocusNode('focus-1');
    expect(useUIStore.getState().focusNodeId).toBe('focus-1');
  });

  it('sets sidebar tab', () => {
    useUIStore.getState().setSidebarTab('eval');
    expect(useUIStore.getState().sidebarTab).toBe('eval');
  });

  it('sets chat draft', () => {
    useUIStore.getState().setChatDraft('hello');
    expect(useUIStore.getState().chatDraft).toBe('hello');
  });

  it('sets pending chat message', () => {
    useUIStore.getState().setPendingChatMessage({ message: 'hi', context: 'ctx' });
    expect(useUIStore.getState().pendingChatMessage).toEqual({ message: 'hi', context: 'ctx' });
    useUIStore.getState().setPendingChatMessage(null);
    expect(useUIStore.getState().pendingChatMessage).toBeNull();
  });
});
