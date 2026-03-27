import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const RECENT_FILES_PATH = join(app.getPath('userData'), 'recent-files.json')
const MAX_RECENT = 10

function loadRecentFiles(): string[] {
  try {
    if (existsSync(RECENT_FILES_PATH)) {
      const data = JSON.parse(require('fs').readFileSync(RECENT_FILES_PATH, 'utf-8'))
      return Array.isArray(data) ? data.filter((f: unknown) => typeof f === 'string') : []
    }
  } catch { /* ignore */ }
  return []
}

function addRecentFile(filePath: string): void {
  const recent = loadRecentFiles().filter((f) => f !== filePath)
  recent.unshift(filePath)
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT
  try {
    require('fs').writeFileSync(RECENT_FILES_PATH, JSON.stringify(recent), 'utf-8')
    app.addRecentDocument(filePath)
  } catch { /* ignore */ }
}

export function registerFileIPC(): void {
  ipcMain.handle('file:open', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      filters: [
        { name: 'Turtle', extensions: ['ttl'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const filePath = result.filePaths[0]
    const content = await readFile(filePath, 'utf-8')
    addRecentFile(filePath)
    return { filePath, content }
  })

  ipcMain.handle('file:save', async (_event, filePath: string, content: string) => {
    await writeFile(filePath, content, 'utf-8')
    addRecentFile(filePath)
    return true
  })

  ipcMain.handle('file:read-silent', async (_event, filePath: string) => {
    try {
      return await readFile(filePath, 'utf-8')
    } catch {
      return null
    }
  })

  ipcMain.handle('file:save-as', async (_event, content: string) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null

    const result = await dialog.showSaveDialog(win, {
      filters: [
        { name: 'Turtle', extensions: ['ttl'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      defaultPath: 'ontology.ttl'
    })

    if (result.canceled || !result.filePath) return null

    await writeFile(result.filePath, content, 'utf-8')
    addRecentFile(result.filePath)
    return result.filePath
  })

  ipcMain.handle('file:recent-files', () => {
    return loadRecentFiles()
  })

  ipcMain.handle('file:open-recent', async (_event, filePath: string) => {
    try {
      const content = await readFile(filePath, 'utf-8')
      addRecentFile(filePath)
      return { filePath, content }
    } catch {
      return null
    }
  })
}
