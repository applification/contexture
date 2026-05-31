import { expect, test } from '@playwright/test';
import { closeElectron, launchElectron } from './electron-launch';

test.describe('App Launch', () => {
  let electronApp: Awaited<ReturnType<typeof launchElectron>>;
  let page: Awaited<ReturnType<typeof electronApp.firstWindow>>;

  test.beforeAll(async () => {
    electronApp = await launchElectron();
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    await closeElectron(electronApp);
  });

  test('window title contains Contexture', async () => {
    const title = await electronApp.evaluate(({ app }) => app.getName());
    expect(title).toBe('Contexture');
  });

  test('toolbar is visible', async () => {
    await expect(page.getByRole('button', { name: 'Theme' })).toBeVisible({ timeout: 10_000 });
  });

  test('main content area renders', async () => {
    // Empty state shows onboarding actions; graph state shows .react-flow container.
    const hasEmptyState = await page
      .getByRole('button', { name: /inspect sample convex model/i })
      .count();
    const hasGraph = await page.locator('.react-flow').count();
    expect(hasEmptyState + hasGraph).toBeGreaterThan(0);
  });
});
