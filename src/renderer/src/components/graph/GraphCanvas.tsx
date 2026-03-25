import { useEffect, useRef, useCallback } from 'react'
import cytoscape, { type Core, type EventObject } from 'cytoscape'
// @ts-expect-error no types available
import nodeHtmlLabel from 'cytoscape-node-html-label'
import { useOntologyStore } from '@renderer/store/ontology'
import { useUIStore } from '@renderer/store/ui'
import { ontologyToCytoscapeElements } from '@renderer/model/cytoscape'
import { getCytoscapeStylesheet } from './graph-styles'
import { renderNodeHtml } from './node-renderer'
import { layoutOptions } from './layout'

// Register extension once
if (typeof cytoscape('core', 'nodeHtmlLabel') !== 'function') {
  nodeHtmlLabel(cytoscape)
}

export function GraphCanvas(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const ontology = useOntologyStore((s) => s.ontology)
  const setSelectedNode = useUIStore((s) => s.setSelectedNode)
  const setSelectedEdge = useUIStore((s) => s.setSelectedEdge)

  const initCytoscape = useCallback(() => {
    if (!containerRef.current) return

    const elements = ontologyToCytoscapeElements(ontology)

    const cy = cytoscape({
      container: containerRef.current,
      elements: elements as cytoscape.ElementDefinition[],
      style: getCytoscapeStylesheet(),
      layout: elements.length > 0 ? layoutOptions : { name: 'preset' },
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.3
    })

    // HTML labels for card-style nodes
    ;(cy as unknown as { nodeHtmlLabel: (opts: unknown[]) => void }).nodeHtmlLabel([
      {
        query: 'node[type = "class"]',
        halign: 'center',
        valign: 'center',
        cssClass: 'cytoscape-node-html',
        tpl: (data: Record<string, unknown>) => renderNodeHtml(data)
      }
    ])

    // Event handlers
    cy.on('tap', 'node', (evt: EventObject) => {
      const node = evt.target
      setSelectedNode(node.id())
      setSelectedEdge(null)
    })

    cy.on('tap', 'edge', (evt: EventObject) => {
      const edge = evt.target
      setSelectedEdge(edge.id())
      setSelectedNode(null)
    })

    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        setSelectedNode(null)
        setSelectedEdge(null)
      }
    })

    cyRef.current = cy

    return () => {
      cy.destroy()
    }
  }, [ontology, setSelectedNode, setSelectedEdge])

  useEffect(() => {
    const cleanup = initCytoscape()
    return cleanup
  }, [initCytoscape])

  // Update elements when ontology changes without full re-init
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    const elements = ontologyToCytoscapeElements(ontology)
    const currentIds = new Set(cy.elements().map((ele) => ele.id()))
    const newIds = new Set(elements.map((e) => e.data.id))

    // Remove elements that no longer exist
    cy.elements().forEach((ele) => {
      if (!newIds.has(ele.id())) {
        cy.remove(ele)
      }
    })

    // Add new elements
    const toAdd = elements.filter((e) => !currentIds.has(e.data.id))
    if (toAdd.length > 0) {
      cy.add(toAdd as cytoscape.ElementDefinition[])
      cy.layout(layoutOptions).run()
    }
  }, [ontology])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ backgroundColor: 'var(--graph-bg)' }}
    />
  )
}
