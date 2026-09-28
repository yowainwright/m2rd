import { expect, test, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const moveStateNode = async (page: Page, node: Locator) => {
  const original = await node.getAttribute('style');
  const bounds = await node.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2 + 35, bounds!.y + bounds!.height / 2 + 25, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(node).not.toHaveAttribute('style', original!);
  const moved = await node.getAttribute('style');
  return moved;
};

const source = `stateDiagram-v2
    direction LR
    state Decision <<choice>>
    state Fork <<fork>>
    state Join <<join>>
    [*] --> Idle
    Idle --> Idle: retry
    Idle --> Decision
    Decision --> Fork: approved
    Decision --> [*]: declined
    Fork --> Work
    Fork --> Audit
    Work --> Join
    Audit --> Join
    Join --> [*]
    note right of Idle
        Waiting for input
    end note
`;
const concurrent = `stateDiagram-v2
    [*] --> Active
    state Active {
        state Nested {
            [*] --> Ready
            Ready --> Saved: save
        }
        --
        [*] --> Listening
        Listening --> Received: receive
    }
    Active --> [*]
`;

const chooseSample = async (page: Page, name: string) => {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
};
const updateSource = async (page: Page, value: string) => {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(value);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
};

test('selects each sample and starts a new unsaved state document', async ({ page }, testInfo) => {
  await page.goto('./');
  await expect(page.locator('.react-flow__node-sequenceParticipant')).toHaveCount(5);
  await chooseSample(page, 'Flowchart');
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await chooseSample(page, 'State diagram');
  await expect(page.locator('[data-state-shape]')).toHaveCount(9);
  await expect(page.locator('.cm-content')).toContainText('stateDiagram-v2');
  expect(await page.locator('.react-flow__node').allTextContents()).toEqual(
    expect.arrayContaining([
      'active',
      '',
      'booting',
      '',
      'ready',
      'rendering',
      'saving',
      'saved',
      'recover',
    ]),
  );
  await expect(page.locator('[data-sidebar="menu-button"]')).toHaveCount(0);
  await expect
    .poll(() =>
      page.locator('.react-flow').evaluate((canvas) => {
        const bounds = canvas.getBoundingClientRect();
        return Array.from(canvas.querySelectorAll('.react-flow__node')).every((node) => {
          const rect = node.getBoundingClientRect();
          const fitsWidth = rect.left >= bounds.left && rect.right <= bounds.right;
          const fitsHeight = rect.top >= bounds.top && rect.bottom <= bounds.bottom;
          return fitsWidth && fitsHeight;
        });
      }),
    )
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath('state-sample.png') });
});

test('renders choice, fork/join, terminal symbols, notes, and self-loops with real Mermaid', async ({
  page,
}) => {
  await page.goto('./');
  await updateSource(page, source);
  await expect(page.locator('[data-state-shape="choice"]')).toHaveCount(1);
  await expect(page.locator('[data-state-shape="fork"]')).toHaveCount(1);
  await expect(page.locator('[data-state-shape="join"]')).toHaveCount(1);
  await expect(page.locator('[data-state-shape="stateStart"]')).toHaveCount(1);
  await expect(page.locator('[data-state-shape="stateEnd"]')).toHaveCount(1);
  await expect(page.locator('[data-state-shape="note"]')).toContainText('Waiting for input');
  await expect(page.locator('.react-flow__edge')).toHaveCount(11);
  await expect(page.locator('.react-flow__edge-text').filter({ hasText: 'retry' })).toHaveCount(1);
  const dashed = page.locator('.react-flow__edge-path[style*="stroke-dasharray: 5"]');
  await expect(dashed).toHaveCount(1);
  await expect(dashed).not.toHaveAttribute('marker-end');
});

test('only offers fill styling for selected state symbols', async ({ page }) => {
  await page.goto('./');
  await updateSource(
    page,
    'stateDiagram-v2\n state Pick <<choice>>\n [*] --> Pick\n Pick --> Ready',
  );
  const choice = page.locator('[data-state-shape="choice"]');
  await expect(choice).toBeVisible();
  await page.getByRole('button', { name: 'fit view', exact: true }).click();
  await choice.click();
  await page.getByRole('button', { name: 'Toolkit: 1 node' }).click();
  await expect(page.getByLabel('Fill', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Text', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Border', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Shadow', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Surface', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Shape', { exact: true })).toHaveCount(0);
  await page.getByLabel('Fill', { exact: true }).fill('#ef4444');
  await expect(choice.locator('polygon')).toHaveCSS('fill', 'rgb(239, 68, 68)');
});

test('preserves nested concurrent regions through save, reload, source edits, and reset', async ({
  page,
}) => {
  await page.goto('./');
  await updateSource(page, concurrent);
  const regions = page.locator('[data-state-shape="divider"]');
  await expect(regions).toHaveCount(2);
  const original = await page
    .locator('.react-flow__node')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-id')));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('[data-sidebar="menu-button"]')).toHaveCount(1);
  await page.reload();
  await expect(regions).toHaveCount(2);
  await updateSource(page, concurrent.replace(': save', ': save again'));
  await expect(
    page.locator('.react-flow__edge-text').filter({ hasText: 'save again' }),
  ).toHaveCount(1);
  expect(
    await page
      .locator('.react-flow__node')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-id'))),
  ).toEqual(original);
  await page.getByRole('button', { name: 'Reset layout', exact: true }).click();
  await expect(regions).toHaveCount(2);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await chooseSample(page, 'Sequence');
  await expect(page.locator('.react-flow__node-sequenceParticipant')).toHaveCount(5);
  await expect(page.locator('[data-sidebar="menu-button"]')).toHaveCount(1);
});

test('exports native state symbols and labels as SVG', async ({ page }, testInfo) => {
  await page.goto('./');
  await updateSource(page, source);
  await expect(page.locator('[data-state-shape="choice"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'SVG', exact: true }).click();
  const download = await downloading;
  const svg = await readFile((await download.path())!, 'utf8');
  expect(svg).toContain('Waiting for input');
  expect(svg).toContain('polygon');
  expect(svg).toContain('retry');
  await page.screenshot({ path: testInfo.outputPath('state-symbols.png') });
});

test('honors direction and retains repeated labels during rapid source edits', async ({ page }) => {
  await page.goto('./');
  await updateSource(
    page,
    'stateDiagram-v2\n direction LR\n state "Same" as A\n state "Same" as B\n A --> B',
  );
  const nodes = page.locator('.react-flow__node-stateNode');
  await expect(nodes).toHaveCount(2);
  const left = await nodes.nth(0).boundingBox();
  const right = await nodes.nth(1).boundingBox();
  expect(right!.x).toBeGreaterThan(left!.x);
  await updateSource(page, 'stateDiagram-v2\n direction TB\n A --> B');
  await updateSource(page, 'stateDiagram-v2\n direction TB\n First --> Last: latest');
  await expect(nodes).toContainText(['First', 'Last']);
  const top = await nodes.nth(0).boundingBox();
  const bottom = await nodes.nth(1).boundingBox();
  expect(bottom!.y).toBeGreaterThan(top!.y);
  await expect(page.locator('.react-flow__edge-text')).toHaveText('latest');
  expect(await page.pageErrors()).toEqual([]);
});

test('moves, styles, locks, and restores native state nodes without editing source', async ({
  page,
}) => {
  await page.goto('./');
  const content = 'stateDiagram-v2\n A --> B';
  await updateSource(page, content);
  const node = page.locator('.react-flow__node-stateNode').filter({ hasText: 'A' });
  await expect(node).toBeVisible();
  await page.getByRole('button', { name: 'fit view', exact: true }).click();
  const moved = await moveStateNode(page, node);
  await node.click();
  await page.getByRole('button', { name: 'Toolkit: 1 node' }).click();
  await expect(page.getByLabel('Shape', { exact: true })).toHaveCount(0);
  await page.getByLabel('Fill', { exact: true }).fill('#ef4444');
  await expect(node.locator('[data-state-shape]')).toHaveCSS(
    'background-color',
    'rgb(239, 68, 68)',
  );
  await page.getByRole('switch', { name: 'Lock canvas', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(node).not.toHaveClass(/draggable/);
  await expect(page.locator('.cm-content')).toContainText('A --> B');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await page.reload();
  await expect(node).toHaveAttribute('style', moved!);
  await expect(node.locator('[data-state-shape]')).toHaveCSS(
    'background-color',
    'rgb(239, 68, 68)',
  );
  await expect(node).not.toHaveClass(/draggable/);
});

['PNG', 'GIF loop', 'GIF once'].forEach((format) => {
  test(`exports state diagrams as ${format}`, async ({ page }) => {
    await page.goto('./');
    await updateSource(page, 'stateDiagram-v2\n [*] --> A\n A --> [*]');
    await expect(page.locator('[data-state-shape="stateEnd"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const downloading = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: format, exact: true }).click();
    const download = await downloading;
    const bytes = await readFile((await download.path())!);
    if (format === 'PNG') {
      expect(Array.from(bytes.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
      return;
    }
    expect(bytes.subarray(0, 6).toString('ascii')).toBe('GIF89a');
    const loop = bytes.toString('latin1').match(/NETSCAPE2\.0/);
    expect(Boolean(loop)).toBe(format === 'GIF loop');
  });
});

test('supports mobile sample selection and recovery after invalid state input', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await chooseSample(page, 'State diagram');
  await expect(page.locator('[data-state-shape]')).toHaveCount(9);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('stateDiagram-v2\n state Broken {');
  const viewError = page.getByRole('button', { name: 'View error', exact: true });
  await expect(viewError).toBeVisible();
  await expect(page.locator('.cm-lintRange-error')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await viewError.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await updateSource(page, source);
  await expect(page.locator('[data-state-shape="choice"]')).toHaveCount(1);
  await expect(viewError).toHaveCount(0);
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(0);
});
