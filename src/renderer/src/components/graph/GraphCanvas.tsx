import { useEffect, useRef, useCallback, useState } from 'react'
import cytoscape, { type Core, type EventObject } from 'cytoscape'
// @ts-expect-error no types available
import nodeHtmlLabel from 'cytoscape-node-html-label'
import { useOntologyStore } from '@renderer/store/ontology'
import { useUIStore } from '@renderer/store/ui'
import { ontologyToCytoscapeElements } from '@renderer/model/cytoscape'
import { getCytoscapeStylesheet } from './graph-styles'
import { renderNodeHtml } from './node-renderer'
import { layoutOptions } from './layout'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'

// Register extension once
if (typeof cytoscape('core', 'nodeHtmlLabel') !== 'function') {
  nodeHtmlLabel(cytoscape)
}

interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

export function GraphCanvas(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const ontology = useOntologyStore((s) => s.ontology)
  const addClass = useOntologyStore((s) => s.addClass)
  const removeClass = useOntologyStore((s) => s.removeClass)
  const removeObjectProperty = useOntologyStore((s) => s.removeObjectProperty)
  const setSelectedNode = useUIStore((s) => s.setSelectedNode)
  const setSelectedEdge = useUIStore((s) => s.setSelectedEdge)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // Derive a base namespace from prefixes
  const baseNs = Array.from(ontology.prefixes.entries()).find(
    ([k]) => k !== 'owl' && k !== 'rdf' && k !== 'rdfs' && k !== 'xsd'
  )?.[1] || 'http://example.org/ontology#'

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

    // Click handlers
    cy.on('tap', 'node', (evt: EventObject) => {
      setSelectedNode(evt.target.id())
      setSelectedEdge(null)
      setContextMenu(null)
    })

    cy.on('tap', 'edge', (evt: EventObject) => {
      setSelectedEdge(evt.target.id())
      setSelectedNode(null)
      setContextMenu(null)
    })

    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        setSelectedNode(null)
        setSelectedEdge(null)
        setContextMenu(null)
      }
    })

    // Right-click on node
    cy.on('cxttap', 'node', (evt: EventObject) => {
      const node = evt.target
      const nodeId = node.id()
      const pos = evt.renderedPosition || evt.position
      setSelectedNode(nodeId)
      setSelectedEdge(null)

      setContextMenu({
        x: pos.x + containerRef.current!.getBoundingClientRect().left,
        y: pos.y + containerRef.current!.getBoundingClientRect().top,
        items: [
          {
            label: 'Add subclass...',
            action: () => {
              const name = prompt('Subclass name:')
              if (name) {
                const uri = `${baseNs}${name.replace(/\s+/g, '')}`
                addClass(uri, { label: name, subClassOf: [nodeId] })
              }
            }
          },
          { label: '', action: () => {}, separator: true },
          {
            label: 'Delete class',
            destructive: true,
            action: () => removeClass(nodeId)
          }
        ]
      })
    })

    // Right-click on edge
    cy.on('cxttap', 'edge', (evt: EventObject) => {
      const edge = evt.target
      const edgeData = edge.data()
      const pos = evt.renderedPosition || evt.position

      const items: ContextMenuItem[] = []
      if (edgeData.type === 'objectProperty' && edgeData.uri) {
        items.push({
          label: 'Delete property',
          destructive: true,
          action: () => removeObjectProperty(edgeData.uri)
        })
      }

      if (items.length > 0) {
        setContextMenu({
          x: pos.x + containerRef.current!.getBoundingClientRect().left,
          y: pos.y + containerRef.current!.getBoundingClientRect().top,
          items
        })
      }
    })

    // Right-click on canvas
    cy.on('cxttap', (evt: EventObject) => {
      if (evt.target === cy) {
        const pos = evt.renderedPosition || evt.position
        setContextMenu({
          x: pos.x + containerRef.current!.getBoundingClientRect().left,
          y: pos.y + containerRef.current!.getBoundingClientRect().top,
          items: [
            {
              label: 'Add class...',
              action: () => {
                const name = prompt('Class name:')
                if (name) {
                  const uri = `${baseNs}${name.replace(/\s+/g, '')}`
                  addClass(uri, { label: name })
                }
              }
            }
          ]
        })
      }
    })

    cyRef.current = cy

    return () => {
      cy.destroy()
    }
  }, [ontology, setSelectedNode, setSelectedEdge, addClass, removeClass, removeObjectProperty, baseNs])

  useEffect(() => {
    const cleanup = initCytoscape()
    return cleanup
  }, [initCytoscape])

  return (
    <>
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ backgroundColor: 'var(--graph-bg)' }}
      />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  )
}
