/**
 * New Project dialog — end-to-end check that the menu entry opens the
 * dialog and the form renders. The heavy 10-stage scaffold is covered
 * by vitest (`scaffold-orchestrator.test.ts` etc.) + a skipped real-fs
 * suite (`scaffold-e2e.test.ts`); here we just prove the menu → IPC →
 * renderer chain wires up and the form is reachable.
 */
import { expect, test } from '@playwright/test';
import { launchElectron } from './electron-launch';

test.describe('New Project dialog', () => {
  let electronApp: Awaited<ReturnType<typeof launchElectron>>;
  let page: Awaited<ReturnType<typeof electronApp.firstWindow>>;

  test.beforeAll(async () => {
    electronApp = await launchElectron();
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  test('menu entry opens the dialog with the form visible', async () => {
    await electronApp.evaluate(({ BrowserWindow }) => {
      const [win] = BrowserWindow.getAllWindows();
      win?.webContents.send('menu:file-new-project');
    });

    await expect(page.getByRole('heading', { name: /New Project/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel(/Project name/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Choose folder/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Create$/i })).toBeDisabled();
  });

  test('typing an invalid project name surfaces the validation error', async () => {
    // Dialog is already open from the previous test.
    await page.getByLabel(/Project name/i).fill('Bad Name With Spaces');
    await expect(page.getByText(/lowercase letters/i)).toBeVisible();
  });
});
