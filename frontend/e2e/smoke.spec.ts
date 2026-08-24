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

  const sidebar = page.locator('.tool-sidebar');
  await expect(sidebar).toBeVisible({ timeout: 10000 });
  await expect(sidebar.locator('.category-group').first()).toBeVisible({ timeout: 10000 });
});

test('can drag a tool onto the canvas', async ({ page }) => {
  await openBuilder(page);

  const tool = page.locator('.tool-card').first();
  const canvas = page.getByTestId('canvas');
  await expect(tool).toBeVisible({ timeout: 10000 });

  const toolBox = await tool.boundingBox();
  const canvasBox = await canvas.boundingBox();
  expect(toolBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();

  if (!toolBox || !canvasBox) return;

  await page.mouse.move(toolBox.x + toolBox.width / 2, toolBox.y + toolBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 10000 });
});
