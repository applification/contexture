import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  onMenuFileOpen: (callback: () => void): void => {
    ipcRenderer.on('menu:file-open', callback)
  },
  onMenuFileSave: (callback: () => void): void => {
    ipcRenderer.on('menu:file-save', callback)
  },
  onMenuFileSaveAs: (callback: () => void): void => {
    ipcRenderer.on('menu:file-save-as', callback)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
