/**
 * New Project dialog — end-to-end check that the menu entry opens the
 * dialog and the form renders. The heavy scaffold is covered by vitest
 * (`scaffold-orchestrator.test.ts` etc.) + a skipped real-fs suite
 * (`scaffold-e2e.test.ts`); here we prove the menu → IPC → renderer
 * chain wires up and the form is reachable.
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

  async function openDialog(): Promise<void> {
    // Close any previously open dialog so each test starts from a clean state.
    const closeBtn = page.getByRole('button', { name: /^Cancel$/i });
    if (await closeBtn.isVisible()) await closeBtn.click();

    await electronApp.evaluate(({ BrowserWindow }) => {
      const [win] = BrowserWindow.getAllWindows();
      win?.webContents.send('menu:file-new-project');
    });
    await expect(page.getByRole('heading', { name: /New Project/i })).toBeVisible({
      timeout: 10_000,
    });
  }

  test('menu entry opens the dialog with the form visible', async () => {
    await openDialog();
    await expect(page.getByLabel(/Project name/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Choose folder/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Create$/i })).toBeDisabled();
  });

  test('typing an invalid project name surfaces the validation error', async () => {
    await openDialog();
    await page.getByLabel(/Project name/i).fill('Bad Name With Spaces');
    await expect(page.getByText('Name must be lowercase.')).toBeVisible();
  });

  test('app picker shows Web pre-checked and Mobile, Desktop unchecked', async () => {
    await openDialog();
    await expect(page.getByRole('checkbox', { name: /Web/i })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /Mobile/i })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: /Desktop/i })).not.toBeChecked();
  });

  test('unchecking all apps disables Create and surfaces validation message', async () => {
    await openDialog();
    await page.getByRole('checkbox', { name: /Web/i }).uncheck();
    await expect(page.getByText('Select at least one app.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Create$/i })).toBeDisabled();
  });
});
