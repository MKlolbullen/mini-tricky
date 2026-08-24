import { test, expect, type Page } from '@playwright/test';

async function openBuilder(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome to mini-tricky' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /New Workflow/i }).first().click();
  await expect(page.getByTestId('canvas')).toBeVisible({ timeout: 10000 });
}

test('dashboard and builder render without page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await openBuilder(page);

  expect(errors).toHaveLength(0);
});

test('tool sidebar loads categories from the backend catalog', async ({ page }) => {
  await openBuilder(page);

  const sidebar = page.locator('aside.sidebar.left');
  await expect(sidebar).toBeVisible({ timeout: 10000 });
  await expect(sidebar.locator('.tool-group').first()).toBeVisible({ timeout: 10000 });
  await expect(sidebar.locator('.tool-card').first()).toBeVisible({ timeout: 10000 });
});

test('can add a catalog tool to the canvas', async ({ page }) => {
  await openBuilder(page);

  const tool = page.locator('aside.sidebar.left .tool-card').first();
  await expect(tool).toBeVisible({ timeout: 10000 });
  await tool.click();

  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 10000 });
});
