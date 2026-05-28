import { expect, test } from '@playwright/test';

test.describe('Page navigation', () => {
  test('download route redirects to a binary', async ({ page }) => {
    const response = await page.request.get('/download', { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    const location = response.headers().location ?? '';
    expect(location).toMatch(/^https:\/\/(github\.com|objects\.githubusercontent\.com)\//);
  });

  test('download route returns JSON when requested', async ({ page }) => {
    const response = await page.request.get('/download', {
      headers: { Accept: 'application/json' },
    });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { url: string; resolution: string };
    expect(body.url).toMatch(/^https:\/\/(github\.com|api\.github\.com)\//);
    expect(['auto', 'fallback']).toContain(body.resolution);
  });

  test('brand page loads', async ({ page }) => {
    await page.goto('/brand');
    await expect(page).toHaveTitle(/Contexture/i);
  });

  test('theme preference persists across route navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.getByRole('button', { name: 'Toggle theme' }).first().click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBe('light');

    await page.locator('nav a[href="/brand"]').click();
    await expect(page).toHaveURL(/\/brand$/);
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBe('light');
  });

  test('404 page shows for invalid routes', async ({ page }) => {
    const response = await page.goto('/nonexistent-page');
    expect(response?.status()).toBe(404);
  });

  test('clicking Features nav scrolls to features section', async ({ page }) => {
    await page.goto('/');
    await page.locator('nav a[href="#features"]').click();
    await expect(page.locator('#features')).toBeInViewport();
  });
});
