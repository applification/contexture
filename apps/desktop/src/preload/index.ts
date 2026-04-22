import { electronAPI } from '@electron-toolkit/preload';
import { contextBridge } from 'electron';

// Phase 2 placeholder: the real window.api surface (sidecar I/O, MCP op
// tools, eval, update) is rebuilt across issues #87, #96, #100.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
  } catch (err) {
    console.error(err);
  }
}
