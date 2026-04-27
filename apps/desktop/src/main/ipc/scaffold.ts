/**
 * `handleScaffoldStart` — the pure side of the scaffold IPC. Runs
 * preflight, then drives `scaffoldProject` through the composite
 * runner, forwarding every `StageEvent` (and a preflight-failed
 * event when applicable) via the supplied `emit` callback.
 *
 * Kept callback-shaped so tests can drive it without Electron;
 * `registerScaffoldIpc` binds it to `webContents.send`.
 */
import { IRSchema } from '@renderer/model/ir';
import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import type { FsAdapter } from '../documents/document-store';
import { nodeFsAdapter } from '../documents/node-fs-adapter';
import { createCompositeStageRunner } from '../scaffold/composite-runner';
import { nodePreflightDeps } from '../scaffold/node-preflight-deps';
import { nodeSpawner } from '../scaffold/node-spawner';
import { type PreflightError, type PreflightResult, runPreflight } from '../scaffold/preflight';
import {
  type ScaffoldConfig,
  type StageEvent,
  scaffoldProject,
} from '../scaffold/scaffold-project';
import type { Spawner } from '../scaffold/spawn-runner';

export type ScaffoldEvent = StageEvent | { kind: 'preflight-failed'; error: PreflightError };

export interface ScaffoldHandlerDeps {
  fs: FsAdapter;
  spawner: Spawner;
  preflight: (config: ScaffoldConfig) => Promise<PreflightResult>;
  emit: (event: ScaffoldEvent) => void;
  /** Test-only hook — production writes the log through fs. */
  writeLog?: (path: string, content: string) => Promise<void>;
}

export async function handleScaffoldStart(
  config: ScaffoldConfig,
  deps: ScaffoldHandlerDeps,
): Promise<void> {
  const { fs, spawner, preflight, emit, writeLog } = deps;

  // Validate the scratch IR before running any stages so we can surface
  // the error inline in the dialog (same preflight-failed channel).
  if (config.scratchPath) {
    let raw: string;
    try {
      raw = await fs.readFile(config.scratchPath);
    } catch {
      emit({ kind: 'preflight-failed', error: { kind: 'scratch-unreadable' } });
      return;
    }
    const parsed = IRSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      emit({ kind: 'preflight-failed', error: { kind: 'scratch-invalid-ir' } });
      return;
    }
  }

  const preflightResult = await preflight(config);
  if (!preflightResult.ok) {
    emit({ kind: 'preflight-failed', error: preflightResult.error });
    return;
  }

  const runner = createCompositeStageRunner({ fs, spawner });
  const logWriter =
    writeLog ?? (async (path: string, content: string) => fs.writeFile(path, content));

  for await (const ev of scaffoldProject(config, { runner, writeLog: logWriter })) {
    emit(ev);
  }
}

export function registerScaffoldIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('scaffold:start', async (_evt, config: ScaffoldConfig) => {
    await handleScaffoldStart(config, {
      fs: nodeFsAdapter,
      spawner: nodeSpawner,
      preflight: (c) => runPreflight({ targetDir: c.targetDir }, nodePreflightDeps),
      emit: (ev) => mainWindow.webContents.send('scaffold:event', ev),
    });
  });
}
