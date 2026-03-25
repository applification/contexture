import type { Stylesheet } from 'cytoscape'

export function getCytoscapeStylesheet(): Stylesheet[] {
  return [
    // Class nodes - invisible base (HTML label handles rendering)
    {
      selector: 'node[type = "class"]',
      style: {
        shape: 'round-rectangle',
        width: 200,
        height: (ele) => {
          const dtProps = ele.data('datatypeProperties') || []
          return 48 + dtProps.length * 22
        },
        'background-color': 'var(--graph-node-class)',
        'background-opacity': 0.15,
        'border-width': 1,
        'border-color': 'var(--graph-node-class)',
        'border-opacity': 0.4,
        label: '',
        'overlay-padding': 6
      }
    },
    // Selected node
    {
      selector: 'node[type = "class"]:selected',
      style: {
        'border-width': 2,
        'border-color': 'var(--graph-node-selected)',
        'border-opacity': 1,
        'background-color': 'var(--graph-node-selected)',
        'background-opacity': 0.2
      }
    },
    // Hover
    {
      selector: 'node[type = "class"]:active',
      style: {
        'background-color': 'var(--graph-node-hover)',
        'background-opacity': 0.2
      }
    },
    // Object property edges
    {
      selector: 'edge[type = "objectProperty"]',
      style: {
        width: 1.5,
        'line-color': 'var(--graph-edge-property)',
        'target-arrow-color': 'var(--graph-edge-property)',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 1.2,
        'curve-style': 'bezier',
        label: 'data(label)',
        'font-size': 11,
        'font-weight': '500',
        color: '#ffffff',
        'text-background-color': 'var(--graph-edge-property)',
        'text-background-opacity': 1,
        'text-background-padding': '4px',
        'text-background-shape': 'roundrectangle',
        'text-border-width': 0,
        'text-rotation': 'autorotate',
        'edge-text-rotation': 'autorotate'
      }
    },
    // SubClassOf edges
    {
      selector: 'edge[type = "subClassOf"]',
      style: {
        width: 2,
        'line-color': 'var(--graph-edge-subclass)',
        'line-style': 'dashed',
        'line-dash-pattern': [8, 4],
        'target-arrow-color': 'var(--graph-edge-subclass)',
        'target-arrow-shape': 'triangle-backcurve',
        'arrow-scale': 1,
        'curve-style': 'bezier',
        label: 'subClassOf',
        'font-size': 10,
        'font-weight': '500',
        color: '#ffffff',
        'text-background-color': 'var(--graph-edge-subclass)',
        'text-background-opacity': 1,
        'text-background-padding': '3px',
        'text-background-shape': 'roundrectangle',
        'text-rotation': 'autorotate',
        'edge-text-rotation': 'autorotate'
      }
    },
    // DisjointWith edges
    {
      selector: 'edge[type = "disjointWith"]',
      style: {
        width: 1.5,
        'line-color': 'var(--destructive)',
        'line-style': 'dotted',
        'target-arrow-shape': 'none',
        'curve-style': 'bezier',
        label: 'disjointWith',
        'font-size': 10,
        'font-weight': '500',
        color: '#ffffff',
        'text-background-color': 'var(--destructive)',
        'text-background-opacity': 1,
        'text-background-padding': '3px',
        'text-background-shape': 'roundrectangle',
        'text-rotation': 'autorotate',
        'edge-text-rotation': 'autorotate'
      }
    },
    // Selected edge
    {
      selector: 'edge:selected',
      style: {
        width: 3,
        'line-color': 'var(--graph-node-selected)',
        'target-arrow-color': 'var(--graph-node-selected)'
      }
    },
    // Search highlight flash
    {
      selector: 'node.search-hit',
      style: {
        'border-width': 3,
        'border-color': 'var(--primary)',
        'border-opacity': 1,
        'background-color': 'var(--primary)',
        'background-opacity': 0.25
      }
    },
  ]
}
