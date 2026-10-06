import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.use({ viewport: { width: 1600, height: 1000 }, timezoneId: 'UTC' });

const updateSource = async (page: Page, source: string) => {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(source);
};

const chooseGantt = async (page: Page) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Gantt chart', exact: true }).click();
  await expect(page.locator('[data-gantt-task]')).toHaveCount(4);
};

const selectFill = async (page: Page, label: string) => {
  await page.locator(`[data-gantt-task="${label}"]`).click();
  await page.getByRole('button', { name: 'adj diagram', exact: true }).click();
  await expect(page.getByLabel('Shape', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Marker', { exact: true })).toHaveCount(0);
  await page.getByLabel('Fill', { exact: true }).fill('#ef4444');
  await page.keyboard.press('Escape');
};

test('renders dates, statuses, sections, and milestones as native nodes', async ({ page }) => {
  await chooseGantt(page);
  const frame = page.locator('[data-gantt-kind="gantt-frame"]');
  await expect(frame).toContainText('Delivery');
  await expect(frame).toContainText('Follow-up');
  await expect(frame).toContainText('2026-09-30');
  await expect(page.locator('[data-gantt-task="Build"]')).toHaveAttribute(
    'data-gantt-status',
    'done',
  );
  await expect(page.locator('[data-gantt-task="Review"]')).toHaveAttribute(
    'title',
    /2026-09-24T00:00:00.000Z · 2026-09-28T00:00:00.000Z/,
  );
  const milestone = page.locator('[data-gantt-task="Ship"] [data-gantt-bar]');
  await expect(milestone).not.toHaveCSS('transform', 'none');
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await expect(page.locator('[data-gantt-kind] svg')).toHaveCount(0);
  expect(await page.pageErrors()).toEqual([]);
});

test('keeps task geometry and source unchanged after dragging or deleting', async ({ page }) => {
  await chooseGantt(page);
  const task = page.locator('[data-gantt-task="Build"]');
  const node = task.locator('..');
  const before = await node.getAttribute('style');
  const source = await page.locator('.cm-content').innerText();
  const box = (await task.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + 30, { steps: 5 });
  await page.mouse.up();
  await expect(node).toHaveAttribute('style', before!);
  await node.focus();
  await page.keyboard.press('Backspace');
  await expect(page.locator('[data-gantt-task]')).toHaveCount(4);
  await expect(page.locator('.cm-content')).toHaveText(source);
});

test('refreshes schedule geometry but keeps styling through edits, history, and reload', async ({
  page,
}) => {
  await chooseGantt(page);
  await selectFill(page, 'Build');
  const task = page.locator('[data-gantt-task="Build"]');
  const node = task.locator('..');
  const before = await node.getAttribute('style');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  const source = await page.locator('.cm-content').innerText();
  await updateSource(page, source.replace('2026-09-21, 3d', '2026-09-21, 4d'));
  await expect(task).toHaveAttribute('title', /2026-09-25T00:00:00.000Z/);
  await expect(node).not.toHaveAttribute('style', before!);
  await expect(task.locator('[data-gantt-bar]')).toHaveCSS('background-color', 'rgb(239, 68, 68)');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await page.reload();
  await expect(task).toHaveAttribute('title', /2026-09-25T00:00:00.000Z/);
  await expect(task.locator('[data-gantt-bar]')).toHaveCSS('background-color', 'rgb(239, 68, 68)');
  const history = page.getByRole('region', { name: 'Version history' });
  await history.getByRole('button', { name: /^v1\b/ }).click();
  await expect(task).toHaveAttribute('title', /2026-09-24T00:00:00.000Z/);
  await page.getByRole('button', { name: 'Reset layout', exact: true }).click();
  await expect(task.locator('[data-gantt-bar]')).toHaveCSS('background-color', 'rgb(239, 68, 68)');
});

test('retains explicit taskN identity and appearance across rename, section edits, and reload', async ({
  page,
}) => {
  await chooseGantt(page);
  const source =
    'gantt\n dateFormat YYYY-MM-DD\n todayMarker off\n section Original\n Work :done, task1, 2026-09-21, 2d';
  await updateSource(page, source);
  const original = page.locator('[data-gantt-task="Work"]');
  await expect(original).toBeVisible();
  await selectFill(page, 'Work');
  const id = await original.locator('..').getAttribute('data-id');
  const changed = source.replace('Original', 'Moved').replace('Work', 'Renamed');
  await updateSource(page, changed);
  const renamed = page.locator('[data-gantt-task="Renamed"]');
  await expect(renamed).toBeVisible();
  await expect(renamed.locator('..')).toHaveAttribute('data-id', id!);
  await expect(renamed.locator('..')).toHaveClass(/selected/);
  await expect(renamed.locator('[data-gantt-bar]')).toHaveCSS(
    'background-color',
    'rgb(239, 68, 68)',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await page.reload();
  await expect(renamed.locator('..')).toHaveAttribute('data-id', id!);
  await expect(renamed.locator('[data-gantt-bar]')).toHaveCSS(
    'background-color',
    'rgb(239, 68, 68)',
  );
});

test('retains anonymous task identity after insertion and avoids ambiguous style transfer', async ({
  page,
}) => {
  await chooseGantt(page);
  const source = 'gantt\n todayMarker off\n Work :2026-09-21, 2d';
  await updateSource(page, source);
  await expect(page.locator('[data-gantt-task]')).toHaveCount(1);
  await selectFill(page, 'Work');
  const task = page.locator('[data-gantt-task="Work"]');
  const id = await task.locator('..').getAttribute('data-id');
  await updateSource(page, source.replace(' Work', ' Other :2026-09-20, 1d\n Work'));
  await expect(page.locator('[data-gantt-task]')).toHaveCount(2);
  await expect(task.locator('..')).toHaveAttribute('data-id', id!);
  await expect(task.locator('[data-gantt-bar]')).toHaveCSS('background-color', 'rgb(239, 68, 68)');
  await updateSource(page, `${source}\n Work :2026-09-24, 2d`);
  await expect(task).toHaveCount(2);
  await expect(task.first().locator('[data-gantt-bar]')).not.toHaveCSS(
    'background-color',
    'rgb(239, 68, 68)',
  );
  await expect(task.last().locator('[data-gantt-bar]')).not.toHaveCSS(
    'background-color',
    'rgb(239, 68, 68)',
  );
});

[
  '---\nconfig:\n  gantt:\n    displayMode: compact\n---\ngantt\n Work :2026-09-21, 2d',
  'gantt\n Work :vert, 2026-09-21, 2d',
  '---\nconfig:\n  look: handDrawn\n---\ngantt\n Work :2026-09-21, 2d',
].forEach((source, index) => {
  test(`rejects unsupported input ${index} and recovers`, async ({ page }) => {
    await chooseGantt(page);
    await updateSource(page, source);
    const error = page.getByRole('button', { name: 'View error', exact: true });
    await expect(error).toBeVisible();
    await error.click();
    await expect(page.getByRole('dialog')).toContainText('This Gantt diagram is not supported');
    await page.keyboard.press('Escape');
    await updateSource(page, 'gantt\n Work :2026-09-21, 2d');
    await expect(error).toHaveCount(0);
    await expect(page.locator('[data-gantt-task="Work"]')).toBeVisible();
  });
});

test('supports configured top axes and clips out-of-range today markers', async ({ page }) => {
  await chooseGantt(page);
  await updateSource(
    page,
    '---\nconfig:\n  gantt:\n    topAxis: true\n---\ngantt\n tickInterval 1day\n Work :2000-01-01, 3d',
  );
  const frame = page.locator('[data-gantt-kind="gantt-frame"]');
  await expect(page.locator('[data-gantt-task="Work"]')).toBeVisible();
  await expect(frame.getByText('2000-01-02', { exact: true })).toHaveCount(2);
  await expect(frame).toHaveCSS('overflow', 'hidden');
  await expect(frame.locator('..')).toHaveCSS('width', '1200px');
});

[
  {
    name: 'implicit starts',
    source: 'First :2026-09-21, 2d\n Work :2d',
    start: '2026-09-23',
    end: '2026-09-25',
  },
  {
    name: 'until dependencies',
    source: 'Boundary :boundary, 2026-09-25, 1d\n Work :work, 2026-09-21, until boundary',
    start: '2026-09-21',
    end: '2026-09-25',
  },
  {
    name: 'inclusive end dates',
    source: 'inclusiveEndDates\n Work :2026-09-21, 2026-09-23',
    start: '2026-09-21',
    end: '2026-09-24',
  },
].forEach(({ name, source, start, end }) => {
  test(`preserves Mermaid scheduling for ${name}`, async ({ page }) => {
    await chooseGantt(page);
    await updateSource(page, `gantt\n dateFormat YYYY-MM-DD\n todayMarker off\n ${source}`);
    const title = `Work · ${start}T00:00:00.000Z · ${end}T00:00:00.000Z`;
    await expect(page.locator('[data-gantt-task="Work"]')).toHaveAttribute('title', title);
  });
});

test.describe('local calendar dates', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('preserves a two-day task across the spring daylight-saving boundary', async ({ page }) => {
    await chooseGantt(page);
    await updateSource(
      page,
      'gantt\n dateFormat YYYY-MM-DD\n todayMarker off\n Work :2026-03-07, 2d',
    );
    await expect(page.locator('[data-gantt-task="Work"]')).toHaveAttribute(
      'title',
      'Work · 2026-03-07T08:00:00.000Z · 2026-03-09T07:00:00.000Z',
    );
  });
});

['SVG', 'PNG', 'GIF loop', 'GIF once'].forEach((format) => {
  test(`exports Gantt as ${format}`, async ({ page }) => {
    await chooseGantt(page);
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const pending = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: format, exact: true }).click();
    const download = await pending;
    const buffer = await readFile((await download.path())!);
    expect(await download.failure()).toBeNull();
    if (format === 'SVG') {
      expect(buffer.toString()).toContain('data-gantt-task="Ship"');
      expect(buffer.toString()).toContain('Release schedule');
      return;
    }
    if (format === 'PNG') {
      expect(Array.from(buffer.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
      return;
    }
    expect(buffer.subarray(0, 6).toString()).toBe('GIF89a');
    expect(buffer.includes('NETSCAPE2.0')).toBe(format === 'GIF loop');
  });
});

test('fits the Gantt sample on mobile without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await chooseGantt(page);
  await expect(page.locator('#workspace-panels')).toHaveCSS('flex-direction', 'column');
  await expect(page.locator('[data-gantt-task="Ship"]')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
