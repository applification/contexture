import { expect, test } from '@playwright/test';

test.describe('Home page', () => {
  test('loads and displays hero section', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Design the schemas that power');
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
    await expect(features.locator('h2')).toContainText('schema editor built for LLM pipelines');
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

  test('footer contains expected links', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer.locator('a[href="/brand"]')).toBeVisible();
    await expect(
      footer.locator('a[href="https://github.com/applification/contexture"]'),
    ).toBeVisible();
  });
});
