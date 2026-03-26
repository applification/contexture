import { app, shell, BrowserWindow, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createMenu } from './menu'
import { registerFileIPC } from './ipc/file'
import { registerClaudeIPC } from './ipc/claude'
import { registerEvalIPC } from './ipc/eval'
import { registerUpdateIpc } from './ipc/update'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.applification.ontograph')

  if (is.dev && process.platform === 'darwin') {
    const icon = nativeImage.createFromPath(join(__dirname, '../../build/icon.icns'))
    if (!icon.isEmpty()) app.dock?.setIcon(icon)
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerFileIPC()
  registerClaudeIPC()
  registerEvalIPC()

  const mainWindow = createWindow()
  Menu.setApplicationMenu(createMenu(mainWindow))
  registerUpdateIpc(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWindow = createWindow()
      Menu.setApplicationMenu(createMenu(newWindow))
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
