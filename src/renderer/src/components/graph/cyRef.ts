import { create } from 'zustand'
import type { Core } from 'cytoscape'

interface CyState {
  instance: Core | null
  version: number
}

export const useCyStore = create<CyState>(() => ({ instance: null, version: 0 }))

export function setCyInstance(cy: Core | null): void {
  useCyStore.setState((s) => ({
    instance: cy,
    version: cy ? s.version + 1 : s.version
  }))
}

export function getCyInstance(): Core | null {
  return useCyStore.getState().instance
}
