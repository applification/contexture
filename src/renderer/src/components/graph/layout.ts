import type { LayoutOptions } from 'cytoscape'
import type { GraphLayout } from '@renderer/store/ui'

export function getLayoutOptions(overrides?: Partial<GraphLayout>): LayoutOptions {
  const nodeSpacing = overrides?.nodeSpacing ?? 180
  const repulsion = overrides?.repulsion ?? 8000
  const gravity = overrides?.gravity ?? 0.25

  return {
    name: 'cose',
    animate: true,
    animationDuration: 500,
    animationEasing: 'ease-out',
    randomize: false,
    componentSpacing: 80,
    nodeRepulsion: () => repulsion,
    idealEdgeLength: () => nodeSpacing,
    edgeElasticity: () => 100,
    nestingFactor: 1.2,
    gravity,
    numIter: 1000,
    initialTemp: 200,
    coolingFactor: 0.95,
    minTemp: 1.0,
    fit: true,
    padding: 50
  } as LayoutOptions
}

export const layoutOptions = getLayoutOptions()
