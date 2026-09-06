// Smoke test for the public (unauthenticated) surface of the Lattice UI.
// Assumes the stack is already running locally (Vite dev server on :3000).
// Authenticated flows are intentionally skipped: no seeded credentials are
// guaranteed to exist.
import { test, expect } from '@playwright/test';

test.describe('Lattice smoke', () => {
  test('landing page renders the hero', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Lattice/);
    await expect(
      page.getByRole('heading', { level: 1 }).filter({ hasText: 'Docker orchestration.' })
    ).toBeVisible();
  });

  test('navigates from landing to the API docs', async ({ page }) => {
    await page.goto('/');

    // "Docs" link in the public navbar points at /api-docs.
    await page.getByRole('link', { name: 'Docs' }).first().click();

    await expect(page).toHaveURL(/\/api-docs$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Lattice API' })
    ).toBeVisible();
  });
});
