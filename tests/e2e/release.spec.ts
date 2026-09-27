import { expect, test } from '@playwright/test';

test('loads the exported app and its assets under /m2rd/', async ({ page }) => {
  const response = await page.goto('./');
  expect(response?.status()).toBe(200);
  await expect(page.locator('.react-flow__node-sequenceParticipant')).toHaveCount(5);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://jeffry.in/m2rd/',
  );
  const icon = page.getByRole('link', { name: 'GitHub repository' }).locator('img');
  await expect(icon).toHaveAttribute('src', '/m2rd/github.svg');
  expect(await icon.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  const assets = await page
    .locator('script[src], link[rel="stylesheet"]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('src') || element.getAttribute('href')),
    );
  expect(assets.length).toBeGreaterThan(0);
  expect(assets.every((path) => path?.startsWith('/m2rd/_next/'))).toBe(true);
  await page.reload();
  await expect(page.locator('.react-flow__node-sequenceParticipant')).toHaveCount(5);
  expect(await page.pageErrors()).toEqual([]);
});

test('starts fresh graphs with the install-check sequence without saving it', async ({ page }) => {
  await page.goto('./');
  const participants = page.locator('.react-flow__node-sequenceParticipant');
  const editor = page.locator('.cm-content');
  await expect(participants).toHaveCount(5);
  await expect(participants).toContainText(['User', 'pre', 'Project files', 'OSV', 'Manager']);
  await expect(editor).toContainText('Install command via shell hook');
  await expect(page.locator('[data-sidebar="menu-button"]')).toHaveCount(0);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('flowchart LR\n  A --> B');
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sequence', exact: true }).click();
  await expect(participants).toHaveCount(5);
  await expect(editor).toContainText('Install command via shell hook');
  await expect(page.locator('[data-sidebar="menu-button"]')).toHaveCount(0);
});

test('exports a real 404 page without an app-shell fallback', async ({ request }) => {
  const missing = await request.get('./does-not-exist/');
  expect(missing.status()).toBe(404);
  const notFound = await request.get('./404.html');
  expect(notFound.status()).toBe(200);
  expect(await notFound.text()).toContain('This page could not be found');
});
