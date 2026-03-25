import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      onMenuFileOpen: (callback: () => void) => void
      onMenuFileSave: (callback: () => void) => void
      onMenuFileSaveAs: (callback: () => void) => void
    }
  }
}
