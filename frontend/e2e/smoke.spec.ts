import { test, expect } from '@playwright/test';

test('canvas renders without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page.getByTestId('canvas')).toBeVisible({ timeout: 10000 });

  expect(errors).toHaveLength(0);
});

test('tool sidebar loads categories', async ({ page }) => {
  await page.goto('/');
  const sidebar = page.locator('.tool-sidebar');
  await expect(sidebar).toBeVisible({ timeout: 10000 });
  await expect(sidebar.locator('.category-group')).not.toHaveCount(0);
});

test('can drag a tool onto the canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toBeVisible({ timeout: 10000 });

  const tool = page.locator('.tool-card').first();
  const canvas = page.getByTestId('canvas');

  if (await tool.isVisible()) {
    const toolBox = await tool.boundingBox();
    const canvasBox = await canvas.boundingBox();
    if (toolBox && canvasBox) {
      await page.mouse.move(toolBox.x + toolBox.width / 2, toolBox.y + toolBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2, { steps: 10 });
      await page.mouse.up();
    }
  }

  const nodes = page.locator('.react-flow__node');
  await expect(nodes).not.toHaveCount(0);
});
