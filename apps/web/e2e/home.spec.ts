import { expect, test } from '@playwright/test';

test.describe('Home page', () => {
  test('loads and displays hero section', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText(
      'A source-of-truth Convex model your app and agents can share.',
    );
    await expect(page.locator('nav')).toBeVisible();
  });

  test('hero keeps animated nodes and side graph treatment', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('hero-animated-graph').locator('canvas')).toBeVisible();
    await expect(page.getByTestId('hero-side-graph')).toBeVisible();
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
      'model boundary for Convex apps built with agents',
    );
  });

  test('download section has CTA link', async ({ page }) => {
    await page.goto('/');
    const download = page.locator('#download');
    await expect(download).toBeVisible();
    await expect(download.locator('a[href="/download"]')).toBeVisible();
  });

  test('feature cards render the Convex-first feature set', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('[data-testid="feature-card"]');
    await expect(cards).toHaveCount(7);
  });

  test('trusted loop section explains the product workflow', async ({ page }) => {
    await page.goto('/');
    const trustedLoop = page.locator('#trusted-loop');
    await expect(trustedLoop).toBeVisible();
    await expect(trustedLoop.locator('h2')).toContainText('From model change to drift clean');
    await expect(trustedLoop.getByRole('heading', { name: 'Model', exact: true })).toBeVisible();
    await expect(trustedLoop.getByRole('heading', { name: 'Emit', exact: true })).toBeVisible();
    await expect(trustedLoop.getByRole('heading', { name: 'Verify', exact: true })).toBeVisible();
    await expect(
      trustedLoop.getByRole('heading', { name: 'Supervise', exact: true }),
    ).toBeVisible();
    await expect(
      trustedLoop.getByRole('heading', { name: 'Reconcile', exact: true }),
    ).toBeVisible();
  });

  test('AI section promotes MCP-native model changes', async ({ page }) => {
    await page.goto('/');
    const aiSection = page.locator('section', {
      has: page.locator('h2:has-text("Let agents propose reviewable Convex model changes")'),
    });
    await expect(aiSection).toBeVisible();
    await expect(aiSection.locator('text=Powered by Claude')).toHaveCount(0);
    await expect(aiSection.locator('text=MCP-native by design')).toBeVisible();
    await expect(
      aiSection.locator('text=Add a memberships table with refs to users and teams'),
    ).toBeVisible();
    await expect(aiSection.locator('text=5 proposed model changes')).toBeVisible();
    await expect(aiSection.locator('text=Rejected duplicate table name Team')).toBeVisible();
    await expect(aiSection.locator('text=Undo turn')).toBeVisible();
    await expect(aiSection.locator('text=discogsReleaseId')).toHaveCount(0);
  });

  test('generated-output proof leads with Convex files', async ({ page }) => {
    await page.goto('/');
    const proof = page.locator('section', {
      has: page.locator('h3:has-text("See generated Convex files before they land in git")'),
    });
    await expect(proof.locator('div').filter({ hasText: /^convex\/schema\.ts$/ })).toBeVisible();
    await expect(
      proof.locator('div').filter({ hasText: /^convex\/validators\.ts$/ }),
    ).toBeVisible();
    await expect(proof.locator('text=memberships: defineTable')).toBeVisible();
    await expect(proof.locator('text=.index("by_user", ["userId"])')).toBeVisible();
  });

  test('use cases lead with Convex app schemas', async ({ page }) => {
    await page.goto('/');
    const useCases = page.locator('section', {
      has: page.locator('h2:has-text("One Convex model, many consumers")'),
    });
    const headings = useCases.locator('.uppercase');
    await expect(headings.first()).toContainText('Convex app schemas');
  });

  test('reconcile section frames generated drift as reviewable', async ({ page }) => {
    await page.goto('/');
    const reconcile = page.locator('section', {
      has: page.locator('h2:has-text("Generated Convex files can drift")'),
    });
    await expect(reconcile).toBeVisible();
    await expect(reconcile.getByText('Generated file changed outside Contexture')).toHaveCount(2);
    await expect(reconcile.locator('text=Regenerate from IR')).toBeVisible();
    await expect(reconcile.locator('text=Apply selected ops')).toBeVisible();
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
