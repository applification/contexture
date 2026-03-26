import { useCallback, useRef } from 'react'
import type { Node, Edge } from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { GraphLayout } from '@renderer/store/ui'

const elk = new ELK()

export interface ELKLayoutResult {
  id: string
  x: number
  y: number
}

export function useELKLayout() {
  const runningRef = useRef(false)

  const runLayout = useCallback(
    async (
      nodes: Node[],
      edges: Edge[],
      layout?: Partial<GraphLayout>
    ): Promise<ELKLayoutResult[]> => {
      if (runningRef.current) return []
      runningRef.current = true

      // nodeSpacing (80–400) maps directly to nodeNode gap — slider right = more spacing
      const nodeGap = layout?.nodeSpacing ?? 180

      const elkGraph = {
        id: 'root',
        layoutOptions: {
          'elk.algorithm': 'org.eclipse.elk.stress',
          'elk.stress.desiredEdgeLength': String(nodeGap * 2),
          'elk.stress.epsilon': '1e-3',
          'elk.stress.iterationLimit': '300',
          'elk.spacing.nodeNode': String(nodeGap),
          'elk.padding': '[top=50, left=50, bottom=50, right=50]'
        },
        children: nodes
          .filter((n) => n.type !== 'group')
          .map((n) => ({
            id: n.id,
            width: n.measured?.width ?? 200,
            height: n.measured?.height ?? 48
          })),
        edges: edges.map((e) => ({
          id: e.id,
          sources: [e.source],
          targets: [e.target]
        }))
      }

      try {
        const result = await elk.layout(elkGraph)
        return (result.children ?? []).map(
          (child: { id: string; x?: number; y?: number }) => ({
            id: child.id,
            x: child.x ?? 0,
            y: child.y ?? 0
          })
        )
      } finally {
        runningRef.current = false
      }
    },
    []
  )

  return { runLayout }
}
