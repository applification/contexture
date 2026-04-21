import { expect, test } from '@playwright/test';
import { launchElectron } from './electron-launch';

test.describe('App Launch', () => {
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

  test('window title contains Contexture', async () => {
    const title = await electronApp.evaluate(({ app }) => app.getName());
    expect(title).toBe('Contexture');
  });

  test('toolbar is visible', async () => {
    await expect(page.locator('[title="Toggle theme"]')).toBeVisible({ timeout: 10_000 });
  });

  test('main content area renders', async () => {
    // Empty state shows "Load sample ontology"; graph state shows .react-flow container
    const hasEmptyState = await page.getByText('Load sample ontology').count();
    const hasGraph = await page.locator('.react-flow').count();
    expect(hasEmptyState + hasGraph).toBeGreaterThan(0);
  });
});
