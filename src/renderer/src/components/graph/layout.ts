import type { LayoutOptions } from 'cytoscape'

export const layoutOptions: LayoutOptions = {
  name: 'cose',
  animate: true,
  animationDuration: 500,
  animationEasing: 'ease-out',
  randomize: false,
  componentSpacing: 80,
  nodeRepulsion: () => 8000,
  idealEdgeLength: () => 180,
  edgeElasticity: () => 100,
  nestingFactor: 1.2,
  gravity: 0.25,
  numIter: 1000,
  initialTemp: 200,
  coolingFactor: 0.95,
  minTemp: 1.0,
  fit: true,
  padding: 50
} as LayoutOptions
