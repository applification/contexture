import { useCallback } from 'react'

interface NodePosition {
  x: number
  y: number
}

interface SidecarData {
  positions: Record<string, NodePosition>
  groups?: Array<{
    id: string
    label: string
    x: number
    y: number
    width: number
    height: number
  }>
}

function sidecarPath(filePath: string): string {
  return filePath + '.layout.json'
}

export function useLayoutSidecar(filePath: string | null) {
  const loadPositions = useCallback(async (): Promise<SidecarData | null> => {
    if (!filePath || filePath.startsWith('sample://') || filePath.startsWith('Sample:')) {
      return null
    }
    const content = await window.api.readFileSilent(sidecarPath(filePath))
    if (!content) return null
    try {
      return JSON.parse(content) as SidecarData
    } catch {
      return null
    }
  }, [filePath])

  const savePositions = useCallback(
    async (data: SidecarData): Promise<void> => {
      if (!filePath || filePath.startsWith('sample://') || filePath.startsWith('Sample:')) return
      await window.api.saveFile(sidecarPath(filePath), JSON.stringify(data, null, 2))
    },
    [filePath]
  )

  return { loadPositions, savePositions }
}
