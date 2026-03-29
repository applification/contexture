import { type BrowserWindow, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

export interface UpdateState {
  status: UpdateStatus;
  version?: string;
  progress?: number;
  error?: string;
}

let state: UpdateState = { status: 'idle' };
let win: BrowserWindow | null = null;

function broadcast(next: UpdateState): void {
  state = next;
  win?.webContents.send('update:state', state);
}

export function registerUpdateIpc(mainWindow: BrowserWindow): void {
  win = mainWindow;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('checking-for-update', () => {
    broadcast({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    broadcast({ status: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    broadcast({ status: 'idle' });
  });

  autoUpdater.on('download-progress', (progress) => {
    broadcast({
      status: 'downloading',
      progress: Math.round(progress.percent),
      version: state.version,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    broadcast({ status: 'ready', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    broadcast({ status: 'error', error: err.message });
  });

  ipcMain.handle('update:check', async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      broadcast({ status: 'error', error: (err as Error).message });
    }
  });

  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      broadcast({ status: 'error', error: (err as Error).message });
    }
  });

  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle('update:open-releases', () => {
    shell.openExternal('https://github.com/DaveHudson/Ontograph/releases');
  });

  ipcMain.handle('update:get-state', () => state);

  // Check on startup after a short delay, then every 4 hours
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
}
