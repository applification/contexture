import { once } from 'node:events';
import nodeProcess from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { type ElectronApplication, _electron as electron } from '@playwright/test';
import { ELECTRON_MAIN } from '../playwright.config';

const CLOSE_TIMEOUT_MS = 5_000;
const KILL_TIMEOUT_MS = 2_000;
const launchedApps = new Set<ElectronApplication>();
let cleanupHooksInstalled = false;

/** Shared Electron launch options — handles headless Linux CI (xvfb + no-sandbox). */
export function electronLaunchOptions() {
  return {
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', ELECTRON_MAIN],
    env: {
      ...process.env,
      // Ensure DISPLAY is set; xvfb-run exports it but guard for safety
      DISPLAY: process.env.DISPLAY ?? ':99',
      E2E: '1',
      NODE_ENV: 'test',
    },
  };
}

export async function launchElectron() {
  installCleanupHooks();
  const electronApp = await electron.launch(electronLaunchOptions());
  launchedApps.add(electronApp);
  electronApp.once('close', () => launchedApps.delete(electronApp));
  return electronApp;
}

export async function closeElectron(electronApp: ElectronApplication | undefined): Promise<void> {
  if (!electronApp) return;

  launchedApps.delete(electronApp);
  const child = electronApp.process();
  const closePromise = electronApp.close().catch(() => undefined);
  const result = await Promise.race([closePromise, delay(CLOSE_TIMEOUT_MS, 'timeout')]);

  if (result !== 'timeout' && !isAlive(child?.pid)) return;

  child?.kill('SIGTERM');
  await waitForProcessExit(child, KILL_TIMEOUT_MS);

  if (isAlive(child?.pid)) {
    child?.kill('SIGKILL');
    await waitForProcessExit(child, KILL_TIMEOUT_MS);
  }

  await Promise.race([closePromise, delay(KILL_TIMEOUT_MS)]).catch(() => undefined);
}

function installCleanupHooks(): void {
  if (cleanupHooksInstalled) return;
  cleanupHooksInstalled = true;

  nodeProcess.once('exit', killLaunchedApps);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    nodeProcess.once(signal, () => {
      killLaunchedApps();
      nodeProcess.exit(signal === 'SIGINT' ? 130 : 143);
    });
  }
}

function killLaunchedApps(): void {
  for (const electronApp of launchedApps) {
    electronApp.process()?.kill('SIGKILL');
  }
  launchedApps.clear();
}

function isAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    nodeProcess.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessExit(
  child: ReturnType<ElectronApplication['process']>,
  timeoutMs: number,
): Promise<void> {
  if (!child || !isAlive(child.pid)) return;
  await Promise.race([once(child, 'exit'), delay(timeoutMs)]).catch(() => undefined);
}
