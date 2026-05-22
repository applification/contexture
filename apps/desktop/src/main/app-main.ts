import { initSentryMain } from './sentry';

initSentryMain();

import { app, BrowserWindow, Menu, nativeImage, shell } from 'electron';
import { syncShellEnvironment } from './syncShellEnvironment';

syncShellEnvironment();

import { join } from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { registerDriftIpc } from './ipc/drift';
import { registerFileIpc } from './ipc/file';
import { registerModelSyncIpc } from './ipc/model-sync';
import { registerReconcileIpc } from './ipc/reconcile';
import { registerSchemaAgentIpc } from './ipc/schema-agent';
import { registerShellIpc } from './ipc/shell';
import { registerUpdateIpc } from './ipc/update';
import { createMenu } from './menu';
import { isSafeExternalUrl } from './security';

const isE2E = process.env.E2E === '1';

if (is.dev && !isE2E) {
  app.setPath('userData', join(app.getPath('appData'), '@contexture/desktop-dev'));
}

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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
    if (is.dev) mainWindow.focus();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) {
      void shell.openExternal(details.url);
    }
    return { action: 'deny' };
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    const loadOptions = isE2E ? { query: { e2e: '1' } } : undefined;
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'), loadOptions);
  }

  return mainWindow;
}

app.setName('Contexture');

// Enable CDP for e2e testing when E2E=1
if (isE2E) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.E2E_CDP_PORT ?? '9222');
  app.commandLine.appendSwitch('remote-allow-origins', '*');
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.applification.contexture');

  if (is.dev && process.platform === 'darwin') {
    const icon = nativeImage.createFromPath(join(__dirname, '../../build/icon.icns'));
    if (!icon.isEmpty()) app.dock?.setIcon(icon);
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  const mainWindow = createWindow();
  Menu.setApplicationMenu(createMenu(mainWindow));
  registerUpdateIpc(mainWindow);
  registerFileIpc(mainWindow);
  registerShellIpc();
  registerReconcileIpc();
  registerSchemaAgentIpc(mainWindow);
  registerDriftIpc(mainWindow);
  registerModelSyncIpc(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWindow = createWindow();
      Menu.setApplicationMenu(createMenu(newWindow));
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || isE2E) {
    app.quit();
  }
});
