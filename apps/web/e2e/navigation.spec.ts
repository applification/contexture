import { expect, test } from '@playwright/test';

test.describe('Page navigation', () => {
  test('download page loads', async ({ page }) => {
    await page.goto('/download');
    await expect(page).toHaveTitle(/Contexture/i);
  });

  test('brand page loads', async ({ page }) => {
    await page.goto('/brand');
    await expect(page).toHaveTitle(/Contexture/i);
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
