import { _electron as electron } from '@playwright/test';
import { ELECTRON_MAIN } from '../playwright.config';

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
  return electron.launch(electronLaunchOptions());
}
