import { expect, test } from '@playwright/test';

test.describe('Home page', () => {
  test('loads and displays hero section', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Design your domain once. Ship it everywhere.');
    await expect(page.locator('nav')).toBeVisible();
  });

  test('navigation links are present', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav a[href="#features"]')).toBeVisible();
    await expect(page.locator('nav a[href="/brand"]')).toBeVisible();
  });

  test('features section is visible', async ({ page }) => {
    await page.goto('/');
    const features = page.locator('#features');
    await expect(features).toBeVisible();
    await expect(features.locator('h2')).toContainText(
      'control plane for AI-native TypeScript apps',
    );
  });

  test('download section has CTA link', async ({ page }) => {
    await page.goto('/');
    const download = page.locator('#download');
    await expect(download).toBeVisible();
    await expect(download.locator('a[href="/download"]')).toBeVisible();
  });

  test('feature cards render all six features', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('#features .grid > div');
    await expect(cards).toHaveCount(6);
  });

  test('AI section promotes agent-safe model changes', async ({ page }) => {
    await page.goto('/');
    const aiSection = page.locator('section', {
      has: page.locator('h2:has-text("Let agents change the model")'),
    });
    await expect(aiSection).toBeVisible();
    await expect(aiSection.locator('text=Powered by Claude')).toHaveCount(0);
    await expect(aiSection.locator('text=Agent-safe by design')).toBeVisible();
  });

  test('footer contains expected links', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer.locator('a[href="/brand"]')).toBeVisible();
    await expect(
      footer.locator('a[href="https://github.com/applification/contexture"]'),
    ).toBeVisible();
  });
});
