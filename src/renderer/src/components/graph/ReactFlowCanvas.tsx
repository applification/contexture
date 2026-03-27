import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useNodesInitialized,
  ConnectionMode,
  type NodeTypes,
  type EdgeTypes,
  type NodeChange,
  type EdgeChange,
  type Edge,
  type Node
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AnimatePresence } from 'motion/react'

import { useOntologyStore } from '@renderer/store/ontology'
import { useUIStore } from '@renderer/store/ui'
import { ontologyToReactFlowElements, type ClassNode, type GroupNode } from '@renderer/model/reactflow'
import { validateOntology } from '@renderer/services/validation'
import { useELKLayout } from '@renderer/hooks/useELKLayout'
import { useLayoutSidecar } from '@renderer/hooks/useLayoutSidecar'
import { ClassNode as ClassNodeComponent } from './nodes/ClassNode'
import { GroupNode as GroupNodeComponent } from './nodes/GroupNode'
import { SubClassOfEdge } from './edges/SubClassOfEdge'
import { ObjectPropertyEdge } from './edges/ObjectPropertyEdge'
import { DisjointWithEdge } from './edges/DisjointWithEdge'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'

const NODE_TYPES: NodeTypes = {
  class: ClassNodeComponent as unknown as NodeTypes['class'],
  group: GroupNodeComponent as unknown as NodeTypes['group']
}

const EDGE_TYPES: EdgeTypes = {
  subClassOf: SubClassOfEdge,
  objectProperty: ObjectPropertyEdge as EdgeTypes[string],
  disjointWith: DisjointWithEdge
}

interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

function GraphFlow(): React.JSX.Element {
  const ontology = useOntologyStore((s) => s.ontology)
  const filePath = useOntologyStore((s) => s.filePath)
  const addClass = useOntologyStore((s) => s.addClass)
  const removeClass = useOntologyStore((s) => s.removeClass)
  const removeObjectProperty = useOntologyStore((s) => s.removeObjectProperty)
  const graphFilters = useUIStore((s) => s.graphFilters)
  const graphLayout = useUIStore((s) => s.graphLayout)
  const setSelectedNode = useUIStore((s) => s.setSelectedNode)
  const setSelectedEdge = useUIStore((s) => s.setSelectedEdge)
  const setAdjacency = useUIStore((s) => s.setAdjacency)
  const selectedNodeId = useUIStore((s) => s.selectedNodeId)
  const setSidebarTab = useUIStore((s) => s.setSidebarTab)
  const setSidebarVisible = useUIStore((s) => s.setSidebarVisible)
  const focusNodeId = useUIStore((s) => s.focusNodeId)
  const setFocusNode = useUIStore((s) => s.setFocusNode)

  const [nodes, setNodes, onNodesChange] = useNodesState<ClassNode | GroupNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const { fitView } = useReactFlow()
  const { runLayout } = useELKLayout()
  const { loadPositions, savePositions } = useLayoutSidecar(filePath)

  const layoutPendingRef = useRef(false)
  const firstLoadRef = useRef(true)
  const prevNodeIdsRef = useRef<Set<string>>(new Set())
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const graphLayoutRef = useRef(graphLayout)

  nodesRef.current = nodes
  edgesRef.current = edges
  graphLayoutRef.current = graphLayout

  const nodesInitialized = useNodesInitialized({ includeHiddenNodes: false })

  // Base namespace from prefixes
  const baseNs = Array.from(ontology.prefixes.entries()).find(
    ([k]) => k !== 'owl' && k !== 'rdf' && k !== 'rdfs' && k !== 'xsd'
  )?.[1] || 'http://example.org/ontology#'
  const baseNsRef = useRef(baseNs)
  useEffect(() => { baseNsRef.current = baseNs }, [baseNs])

  // Reset sidecar check whenever a new file is loaded
  useEffect(() => {
    firstLoadRef.current = true
  }, [filePath])

  // Direct layout runner — always uses current nodes, edges, and layout params
  const runLayoutNow = useCallback(
    async (checkSidecar = false) => {
      const currentNodes = nodesRef.current.filter((n) => n.type !== 'group')
      const currentEdges = edgesRef.current
      if (currentNodes.length === 0) return

      const positions = await runLayout(currentNodes, currentEdges, graphLayoutRef.current)
      if (positions.length === 0) return

      const posMap = new Map(positions.map((p) => [p.id, { x: p.x, y: p.y }]))

      if (checkSidecar && firstLoadRef.current) {
        firstLoadRef.current = false
        const sidecar = await loadPositions()
        if (sidecar) {
          Object.entries(sidecar.positions).forEach(([id, pos]) => posMap.set(id, pos))
        }
      }

      setNodes((prev) =>
        prev.map((n) => {
          const pos = posMap.get(n.id)
          return pos ? { ...n, position: pos } : n
        })
      )
      setTimeout(() => fitView({ padding: 0.1, duration: 400 }), 100)
    },
    [runLayout, loadPositions, setNodes, fitView]
  )

  // Run layout when nodes first become measured after a structural change
  useEffect(() => {
    if (!nodesInitialized || !layoutPendingRef.current) return
    layoutPendingRef.current = false
    runLayoutNow(true)
  }, [nodesInitialized, runLayoutNow])

  const validationErrors = useMemo(() => validateOntology(ontology), [ontology])

  // Sync ontology changes → React Flow nodes/edges
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = ontologyToReactFlowElements(ontology, validationErrors)

    const newIds = new Set(newNodes.map((n) => n.id))
    const prevIds = prevNodeIdsRef.current
    const structureChanged =
      newNodes.some((n) => !prevIds.has(n.id)) || [...prevIds].some((id) => !newIds.has(id))
    prevNodeIdsRef.current = newIds

    if (structureChanged) {
      // Merge existing positions into new nodes
      const posMap = new Map(nodesRef.current.map((n) => [n.id, n.position]))
      const mergedNodes = newNodes.map((n) => ({
        ...n,
        position: posMap.get(n.id) ?? n.position
      }))

      // Preserve group nodes
      const groupNodes = nodesRef.current.filter((n) => n.type === 'group')

      setNodes([...groupNodes, ...mergedNodes])
      setEdges(newEdges)
      layoutPendingRef.current = true
    } else {
      // Data-only change: update node data without repositioning
      setNodes((prev) =>
        prev.map((n) => {
          if (n.type !== 'class') return n
          const updated = newNodes.find((nn) => nn.id === n.id)
          return updated ? { ...n, data: updated.data } : n
        })
      )
      setEdges(newEdges)
    }
  }, [ontology, validationErrors])

  // Compute adjacency when selection changes
  useEffect(() => {
    if (!selectedNodeId) {
      setAdjacency([], [])
      return
    }
    const adjEdgeIds: string[] = []
    const adjNodeIds: string[] = []
    edges.forEach((e) => {
      if (e.source === selectedNodeId || e.target === selectedNodeId) {
        adjEdgeIds.push(e.id)
        adjNodeIds.push(e.source === selectedNodeId ? e.target : e.source)
      }
    })
    setAdjacency(adjNodeIds, adjEdgeIds)
  }, [selectedNodeId, edges, setAdjacency])

  // Focus node from search
  useEffect(() => {
    if (!focusNodeId) return
    setFocusNode(null)
    setSelectedNode(focusNodeId)
    fitView({ nodes: [{ id: focusNodeId }], duration: 350, maxZoom: 2, padding: 0.3 })
  }, [focusNodeId])

  // Filter edges based on visibility settings
  const visibleEdges = edges.filter((e) => {
    if (e.type === 'subClassOf' && !graphFilters.showSubClassOf) return false
    if (e.type === 'disjointWith' && !graphFilters.showDisjointWith) return false
    if (e.type === 'objectProperty' && !graphFilters.showObjectProperties) return false
    return true
  })

  // Filter nodes by minimum degree
  const visibleNodeIds = new Set<string>()
  if (graphFilters.minDegree > 0) {
    const degreeMap = new Map<string, number>()
    visibleEdges.forEach((e) => {
      degreeMap.set(e.source, (degreeMap.get(e.source) ?? 0) + 1)
      degreeMap.set(e.target, (degreeMap.get(e.target) ?? 0) + 1)
    })
    nodes.forEach((n) => {
      if (n.type === 'group' || (degreeMap.get(n.id) ?? 0) >= graphFilters.minDegree) {
        visibleNodeIds.add(n.id)
      }
    })
  }
  const visibleNodes =
    graphFilters.minDegree > 0 ? nodes.filter((n) => visibleNodeIds.has(n.id)) : nodes

  // Save positions to sidecar when nodes change (debounced via the 'onNodesChange' handler)
  const handleNodesChange = useCallback(
    (changes: NodeChange<ClassNode | GroupNode>[]) => {
      onNodesChange(changes)
      // Save positions after drag ends
      const hasDragStop = changes.some((c) => c.type === 'position' && !c.dragging)
      if (hasDragStop) {
        const posData: Record<string, { x: number; y: number }> = {}
        nodesRef.current.forEach((n) => {
          if (n.type === 'class') posData[n.id] = n.position
        })
        savePositions({ positions: posData })
      }
    },
    [onNodesChange, savePositions]
  )

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      onEdgesChange(changes)
    },
    [onEdgesChange]
  )

  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id)
      setSidebarVisible(true)
      setSidebarTab('properties')
    },
    [setSelectedNode, setSidebarVisible, setSidebarTab]
  )

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id)
      setSelectedEdge(null)
      setContextMenu(null)
    },
    [setSelectedNode, setSelectedEdge]
  )

  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: { id: string }) => {
      setSelectedEdge(edge.id)
      setSelectedNode(null)
      setContextMenu(null)
    },
    [setSelectedEdge, setSelectedNode]
  )

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null)
    setSelectedEdge(null)
    setContextMenu(null)
  }, [setSelectedNode, setSelectedEdge])

  const handleNodeContextMenu = useCallback(
    (evt: React.MouseEvent, node: Node) => {
      evt.preventDefault()
      setSelectedNode(node.id)
      setSelectedEdge(null)
      setContextMenu({
        x: evt.clientX,
        y: evt.clientY,
        items: [
          {
            label: 'Add subclass...',
            action: () => {
              const name = prompt('Subclass name:')
              if (name) {
                const uri = `${baseNsRef.current}${name.replace(/\s+/g, '')}`
                addClass(uri, { label: name, subClassOf: [node.id] })
              }
            }
          },
          { label: '', action: () => {}, separator: true },
          {
            label: 'Delete class',
            destructive: true,
            action: () => removeClass(node.id)
          }
        ]
      })
    },
    [setSelectedNode, setSelectedEdge, addClass, removeClass]
  )

  const handleEdgeContextMenu = useCallback(
    (evt: React.MouseEvent, edge: { id: string; type?: string; data?: Record<string, unknown> }) => {
      evt.preventDefault()
      const items: ContextMenuItem[] = []
      if (edge.type === 'objectProperty' && edge.data?.uri) {
        items.push({
          label: 'Delete property',
          destructive: true,
          action: () => removeObjectProperty(edge.data!.uri as string)
        })
      }
      if (items.length > 0) {
        setContextMenu({ x: evt.clientX, y: evt.clientY, items })
      }
    },
    [removeObjectProperty]
  )

  const handlePaneContextMenu = useCallback(
    (evt: React.MouseEvent | MouseEvent) => {
      evt.preventDefault()
      setContextMenu({
        x: evt.clientX,
        y: evt.clientY,
        items: [
          {
            label: 'Add class...',
            action: () => {
              const name = prompt('Class name:')
              if (name) {
                const uri = `${baseNsRef.current}${name.replace(/\s+/g, '')}`
                addClass(uri, { label: name })
              }
            }
          },
          {
            label: 'Add group...',
            action: () => {
              const name = prompt('Group name:')
              if (name) {
                const groupNode: GroupNode = {
                  id: `group-${Date.now()}`,
                  type: 'group',
                  position: { x: evt.clientX - 100, y: evt.clientY - 75 },
                  style: { width: 300, height: 200 },
                  data: { label: name }
                }
                setNodes((prev) => [...prev, groupNode])
              }
            }
          }
        ]
      })
    },
    [addClass, setNodes]
  )

  // Relayout and fitview triggers via custom events
  useEffect(() => {
    function handleRelayout(): void {
      runLayoutNow(false)
    }
    function handleFitView(): void {
      fitView({ padding: 0.1, duration: 300 })
    }
    document.addEventListener('graph:relayout', handleRelayout)
    document.addEventListener('graph:fitview', handleFitView)
    return () => {
      document.removeEventListener('graph:relayout', handleRelayout)
      document.removeEventListener('graph:fitview', handleFitView)
    }
  }, [fitView, runLayoutNow])

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={visibleNodes}
        edges={visibleEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu as unknown as Parameters<typeof ReactFlow>[0]['onEdgeContextMenu']}
        onPaneContextMenu={handlePaneContextMenu}
        connectionMode={ConnectionMode.Loose}
        minZoom={0.1}
        maxZoom={3}
        fitView
        style={{ background: 'var(--graph-bg)' }}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: false }}
        attributionPosition="bottom-left"
      >
        <Background color="oklch(0.5 0.05 250 / 0.3)" gap={24} size={1} />
</ReactFlow>

      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.items}
            onClose={() => setContextMenu(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export function GraphCanvas(): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <GraphFlow />
    </ReactFlowProvider>
  )
}
