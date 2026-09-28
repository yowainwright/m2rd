import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const updateSource = async (page: Page, source: string) => {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(source);
};

const chooseEr = async (page: Page) => {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'ER diagram', exact: true }).click();
  await expect(page.locator('[data-er-entity]')).toHaveCount(3);
};

test('renders the ER sample with attributes, keys, and comments', async ({ page }) => {
  await page.goto('./');
  await chooseEr(page);
  await expect(page.locator('[data-er-entity="CUSTOMER"]')).toContainText('email');
  await expect(page.locator('[data-er-entity="CUSTOMER"]')).toContainText('UK');
  await expect(page.locator('[data-er-entity="ORDER_ITEM"]')).toContainText('PK,FK');
  await expect(page.locator('[data-er-entity="ORDER_ITEM"]')).toContainText('Purchased item');
  await expect(page.locator('.react-flow__edge-erRelation')).toHaveCount(2);
  expect(await page.pageErrors()).toEqual([]);
});

const relationships = [
  { syntax: '||--o{', start: 'only_one', end: 'zero_or_more', dash: 'none' },
  { syntax: '|o..|{', start: 'zero_or_one', end: 'one_or_more', dash: '5px, 4px' },
  { syntax: '}|--o|', start: 'one_or_more', end: 'zero_or_one', dash: 'none' },
  { syntax: '}o..||', start: 'zero_or_more', end: 'only_one', dash: '5px, 4px' },
];

relationships.forEach(({ syntax, start, end, dash }) => {
  test(`preserves both cardinalities and identification for ${syntax}`, async ({ page }) => {
    await page.goto('./');
    await updateSource(page, `erDiagram\n A[Alias]\n A ${syntax} B : relates`);
    await expect(page.locator('[data-er-entity]')).toHaveCount(2);
    await expect(page.locator('[data-er-entity="Alias"]')).toBeVisible();
    const path = page.locator('.react-flow__edge-erRelation .react-flow__edge-path');
    await expect(path).toHaveCSS('stroke-dasharray', dash);
    const markers = await path.evaluate((element) =>
      ['marker-start', 'marker-end'].map((attribute) => {
        const id = element.getAttribute(attribute)!.slice(5, -1);
        return document.getElementById(id)?.getAttribute('data-er-marker');
      }),
    );
    expect(markers).toEqual([start, end]);
  });
});

test('retains tiled rows, movement, and relationships through save and reload', async ({
  page,
}) => {
  await page.goto('./');
  await chooseEr(page);
  const node = page.locator('.react-flow__node[data-id="er:CUSTOMER"]');
  const before = await node.getAttribute('style');
  const bounds = await node.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + 8);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2 + 25, bounds!.y - 22, { steps: 5 });
  await page.mouse.up();
  await expect(node).not.toHaveAttribute('style', before!);
  const moved = await node.getAttribute('style');
  await node.click();
  await page.getByRole('button', { name: 'Toolkit: 1 node' }).click();
  await expect(page.getByLabel('Shape', { exact: true })).toHaveCount(0);
  await page.getByLabel('Fill', { exact: true }).fill('#ef4444');
  await page.getByLabel('Surface', { exact: true }).click();
  await page.getByRole('option', { name: 'Dot pattern', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await page.reload();
  await expect(node).toHaveAttribute('style', moved!);
  const surface = node.locator('[data-er-entity]');
  await expect(surface).toHaveCSS('background-color', 'rgb(239, 68, 68)');
  await expect(surface).toHaveCSS('background-size', '8px 8px');
  const rows = surface.locator(':scope > div[style*="background-image"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveCSS('background-size', '8px 8px');
  await expect(rows.nth(1)).toHaveCSS('background-size', '8px 8px');
  await expect(page.locator('[data-er-marker="zero_or_more"]')).toHaveCount(1);
  await expect(page.locator('.react-flow__edge-erRelation')).toHaveCount(2);
});

test('keeps parallel and self relationships distinct after source reordering', async ({ page }) => {
  await page.goto('./');
  const owns = 'A ||--o{ B : owns';
  const shares = 'A |o..|{ B : shares';
  const recursive = 'A }|--o| A : recursive';
  await updateSource(page, `erDiagram\n${owns}\n${shares}\n${recursive}`);
  const edges = page.locator('.react-flow__edge-erRelation');
  await expect(edges).toHaveCount(3);
  const owned = edges.filter({ hasText: 'owns' });
  const id = await owned.getAttribute('data-testid');
  await owned.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Toolkit: 1 edge', exact: true }).click();
  await page.getByLabel('Color', { exact: true }).fill('#ef4444');
  await page.keyboard.press('Escape');
  await updateSource(page, `erDiagram\n${shares}\n${recursive}\n${owns}\n${shares}`);
  await expect(edges).toHaveCount(4);
  await expect(owned).toHaveAttribute('data-testid', id!);
  await expect(owned.locator('.react-flow__edge-path')).toHaveCSS('stroke', 'rgb(239, 68, 68)');
  const ids = await edges.evaluateAll((items) =>
    items.map((item) => item.getAttribute('data-testid')),
  );
  expect(new Set(ids).size).toBe(4);
  await expect(page.locator('.react-flow__edge-erRelation', { hasText: 'recursive' })).toHaveCount(
    1,
  );
});

[
  'erDiagram\n A["**Rich**"]',
  'erDiagram\n subgraph Group\n A\n end',
  '---\nconfig:\n  look: handDrawn\n---\nerDiagram\n A',
].forEach((source, index) => {
  test(`rejects unsupported ER input ${index} and recovers`, async ({ page }) => {
    await page.goto('./');
    await updateSource(page, source);
    const error = page.getByRole('button', { name: 'View error', exact: true });
    await expect(error).toBeVisible();
    await error.click();
    await expect(
      page.getByText('This ER diagram is not supported.', { exact: false }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await updateSource(page, 'erDiagram\n RECOVERED');
    await expect(page.locator('[data-er-entity="RECOVERED"]')).toBeVisible();
    await expect(error).toHaveCount(0);
    expect(await page.pageErrors()).toEqual([]);
  });
});

test('exports native ER attributes and cardinality markers', async ({ page }) => {
  await page.goto('./');
  await chooseEr(page);
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'SVG', exact: true }).click();
  const download = await downloading;
  const svg = await readFile((await download.path())!, 'utf8');
  expect(svg).toContain('CUSTOMER');
  expect(svg).toContain('Purchased item');
  expect(svg).toContain('data-er-marker="zero_or_more"');
  expect(svg).toContain('marker-end="url(#');
});
