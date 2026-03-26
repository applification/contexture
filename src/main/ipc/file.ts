import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'fs/promises'

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
    return { filePath, content }
  })

  ipcMain.handle('file:save', async (_event, filePath: string, content: string) => {
    await writeFile(filePath, content, 'utf-8')
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
    return result.filePath
  })
}
