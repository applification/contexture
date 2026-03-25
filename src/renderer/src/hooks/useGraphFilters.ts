import { useEffect } from 'react'
import { useUIStore } from '@renderer/store/ui'
import { getCyInstance, useCyStore } from '@renderer/components/graph/cyRef'

export function useGraphFilters(): void {
  const graphFilters = useUIStore((s) => s.graphFilters)
  const cyVersion = useCyStore((s) => s.version)

  useEffect(() => {
    const cy = getCyInstance()
    if (!cy) return

    const { showSubClassOf, showDisjointWith, showObjectProperties, showDatatypeProperties, minDegree } =
      graphFilters

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cya = cy as any

    showSubClassOf
      ? cya.edges('[type = "subClassOf"]').show()
      : cya.edges('[type = "subClassOf"]').hide()
    showDisjointWith
      ? cya.edges('[type = "disjointWith"]').show()
      : cya.edges('[type = "disjointWith"]').hide()
    showObjectProperties
      ? cya.edges('[type = "objectProperty"]').show()
      : cya.edges('[type = "objectProperty"]').hide()

    cy.nodes('[type = "class"]').forEach((node) => {
      const count = (node.data('datatypeProperties') || []).length
      if (count > 0) {
        node.style('height', (showDatatypeProperties ? 48 + count * 22 : 48) as unknown as string)
      }
    })

    // Set display via node.style() which fires 'style' events that nodeHtmlLabel
    // listens to. The ':visible' query in GraphCanvas then routes to removeElemById.
    cy.nodes().forEach((node) => {
      const degree = node.degree(false)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      node.style('display' as any, degree < minDegree ? 'none' : 'element')
    })
  }, [graphFilters, cyVersion])
}
