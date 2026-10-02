import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import packageMetadata from '../../package.json' with { type: 'json' };

const checkSidebarLifecycle = async ({ page }: { page: Page }, testInfo: TestInfo) => {
  const { toggle, sidebar, navigation, empty } = await openEmptySidebar(page, testInfo);
  await renameGraph(page, 'Unsaved draft');
  await expect(toggle).toBeVisible();
  await saveNamedGraph(page, 'Saved sidebar graph');
  await expect(toggle).toBeVisible();
  await openSavedGraphs(page);
  await expect(empty).toHaveCount(0);
  await expect(
    navigation.getByRole('button', { name: 'Saved sidebar graph', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(toggle).toBeVisible();
  await openSavedGraphs(page);
  await expect(
    navigation.getByRole('button', { name: 'Saved sidebar graph', exact: true }),
  ).toBeVisible();
  await sidebar.getByRole('button', { name: 'Close sidebar' }).click();
  await expect(navigation).not.toBeInViewport();
  await createNewGraph(page);
  await expect(toggle).toBeVisible();
  await openSavedGraphs(page);
  await navigation.getByRole('button', { name: 'Saved sidebar graph', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rename graph' })).toHaveText(
    'Saved sidebar graph',
  );
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(toggle).toBeVisible();
  await openSavedGraphs(page);
  await expect(navigation.locator('[data-sidebar="menu-button"]')).toHaveCount(0);
  await expect(empty).toBeVisible();
  await expect(sidebar.getByRole('list', { name: 'Open-source credits' })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Close sidebar' }).click();
  await page.reload();
  await expect(page.locator('.react-flow__node-sequenceParticipant')).toHaveCount(5);
  await expect(toggle).toBeVisible();
  await openSavedGraphs(page);
  await expect(navigation.locator('[data-sidebar="menu-button"]')).toHaveCount(0);
};

const checkSidebarScrolling = async ({ page }: { page: Page }) => {
  const { sidebar, footer, scrollport, graphButtons, footerBefore } =
    await openScrollableSidebar(page);
  const sidebarBounds = await getBounds(sidebar);
  const sidebarInnerWidth = await sidebar.evaluate((element) => element.clientWidth);
  expect(footerBefore.x).toBe(sidebarBounds.x);
  expect(footerBefore.width).toBe(sidebarInnerWidth);
  await expect(footer).toHaveCSS('border-top-width', '1px');
  expect(await scrollport.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );
  await scrollport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await scrollport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const lastGraph = graphButtons.last();
  const lastBounds = await getBounds(lastGraph);
  const listBounds = await getBounds(scrollport);
  expect(lastBounds.y).toBeGreaterThanOrEqual(listBounds.y);
  expect(lastBounds.y + lastBounds.height).toBeLessThanOrEqual(listBounds.y + listBounds.height);
  expect(listBounds.y + listBounds.height).toBeLessThanOrEqual(footerBefore.y);
  expect(footerBefore.y - listBounds.y - listBounds.height).toBeLessThanOrEqual(8);
  expect(await getBounds(footer)).toEqual(footerBefore);
  await lastGraph.click();
  await expect(page.getByRole('button', { name: 'Rename graph' })).toHaveText('Saved graph 1');
};

const expectLoopingGifExport = async (page: Page) => {
  const gifDownloadPromise = page.waitForEvent('download');

  await selectDownload(page, 'GIF loop');

  const gifDownload = await gifDownloadPromise;
  const gifOutputPath = '.next/cache/playwright/export.gif';

  await gifDownload.saveAs(gifOutputPath);

  const gif = await readFile(gifOutputPath);

  expect(gifDownload.suggestedFilename()).toBe('m2rd-graph.gif');
  expect(gif.subarray(0, 6).toString('ascii')).toBe('GIF89a');
  expect(gif.toString('latin1')).toContain('NETSCAPE2.0');
};

const openScrollableSidebar = async (page: Page) => {
  test.setTimeout(60_000);
  await page.goto('./');
  await expect(page.locator('.react-flow__node-sequenceParticipant')).toHaveCount(5);
  await createScrollableGraphList(page);
  const navigation = await openSavedGraphs(page);
  const sidebar = page.locator('[data-sidebar="sidebar"]');
  const footer = sidebar.locator('[data-sidebar="footer"]');
  const scrollport = sidebar.locator('[data-sidebar="group-content"]');
  const graphButtons = navigation.locator('[data-sidebar="menu-button"]');
  await expect(graphButtons).toHaveCount(12);
  await expectThreeCreditLines(footer);
  await footer.getByRole('link', { name: 'm2rd', exact: true }).click({ trial: true });
  const footerBefore = await getBounds(footer);
  return { sidebar, footer, scrollport, graphButtons, footerBefore };
};

const openEmptySidebar = async (page: Page, testInfo: TestInfo) => {
  await page.goto('./');
  await expect(page.locator('.react-flow__node-sequenceParticipant')).toHaveCount(5);
  const toggle = page.getByRole('button', { name: 'Toggle Sidebar' });
  const sidebar = page.locator('[data-sidebar="sidebar"]');
  await expect(toggle).toBeVisible();
  const navigation = await openSavedGraphs(page);
  const empty = navigation.locator('[data-slot="empty"]');
  await expect(empty).toContainText('No saved graphs yet');
  await expect(empty).toContainText('Save a diagram to see it here.');
  await expect(empty.locator('svg.lucide-file-x')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('empty-sidebar.png') });
  await expect(navigation.locator('[data-sidebar="menu-button"]')).toHaveCount(0);
  await expect(sidebar.getByRole('list', { name: 'Open-source credits' })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Close sidebar' }).click();
  await expect(page.getByRole('heading', { name: 'Saved graphs' })).not.toBeInViewport();
  return { toggle, sidebar, navigation, empty };
};

const expectPngExport = async (page: Page) => {
  const pngDownloadPromise = page.waitForEvent('download');

  await selectDownload(page, 'PNG');

  const pngDownload = await pngDownloadPromise;
  const pngOutputPath = '.next/cache/playwright/export.png';

  await pngDownload.saveAs(pngOutputPath);

  const png = await readFile(pngOutputPath);
  const pngSignature = Array.from(png.subarray(0, 4));

  expect(pngDownload.suggestedFilename()).toBe('m2rd-graph.png');
  expect(pngSignature).toEqual([0x89, 0x50, 0x4e, 0x47]);
};

const expectStyledSvgExport = async (page: Page) => {
  const downloadPromise = page.waitForEvent('download');

  await selectDownload(page, 'SVG');

  const download = await downloadPromise;
  const outputPath = '.next/cache/playwright/export.svg';

  await download.saveAs(outputPath);

  const svg = await readFile(outputPath, 'utf8');

  expect(download.suggestedFilename()).toBe('m2rd-graph.svg');
  expect(svg).toContain('<svg');
  expect(svg).toContain('Write Mermaid');
  expect(svg).toContain('rgb(239, 68, 68)');
};

const expectRedactedInputEvent = async (page: Page) => {
  let consoleMessages: unknown[] = [];

  page.on('console', (message) => {
    const [firstArgument] = message.args();
    const isInfo = message.type() === 'info';
    const hasArgument = Boolean(firstArgument);
    const shouldSkipMessage = !isInfo || !hasArgument;

    if (shouldSkipMessage) {
      return;
    }

    void firstArgument
      .jsonValue()
      .then((value) => {
        const isObjectValue = value !== null && typeof value === 'object';

        if (isObjectValue) {
          consoleMessages = consoleMessages.concat(value);
        }
      })
      .catch(() => {});
  });

  await page.goto('./');

  await updateEditor(page);

  await expect
    .poll(() => consoleMessages)
    .toContainEqual(
      expect.objectContaining({
        event: 'input.update',
        msg: 'm2rd app event',
        source: '[REDACTED]',
      }),
    );
};

const resizePanelsWithPointer = async (
  page: Page,
  editor: Locator,
  canvas: Locator,
  handle: Locator,
) => {
  const editorBefore = await getBounds(editor);
  const canvasBefore = await getBounds(canvas);
  const handleBefore = await getBounds(handle);
  const x = handleBefore.x + handleBefore.width / 2;
  const y = handleBefore.y + handleBefore.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 140, y, { steps: 12 });
  await page.mouse.up();

  const minimumEditorWidth = editorBefore.width + 100;
  const maximumCanvasWidth = canvasBefore.width - 100;
  await expect
    .poll(async () => (await getBounds(editor)).width)
    .toBeGreaterThan(minimumEditorWidth);
  await expect.poll(async () => (await getBounds(canvas)).width).toBeLessThan(maximumCanvasWidth);
};

const writeLegacyRecords = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('m2rd');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(['translations', 'workspaces'], 'readwrite');
      const translations = transaction.objectStore('translations');
      const workspaces = transaction.objectStore('workspaces');
      const readTranslations = translations.getAll();
      const readWorkspaces = workspaces.getAll();
      readTranslations.onsuccess = () => {
        const [translation] = readTranslations.result;
        const settingsEntries = Object.entries(translation.settings);
        const legacyEntries = settingsEntries.filter(([key]) => key !== 'edgeMarker');
        const settings = Object.fromEntries(legacyEntries);
        const [first, second] = translation.elements.edges;
        const style = Object.assign({}, first.style, { stroke: '#a855f7', strokeWidth: 99 });
        const edge = Object.assign({}, first, { markerEnd: { type: 'arrowclosed' }, style });
        const elements = Object.assign({}, translation.elements, { edges: [edge, second] });
        const legacy = Object.assign({}, translation, { elements, settings });
        translations.put(legacy);
      };
      readWorkspaces.onsuccess = () => {
        const [workspace] = readWorkspaces.result;
        const legacy = Object.assign({}, workspace, { name: 'Untitled Graph' });
        workspaces.put(legacy);
      };
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error);
      };
    };
  });

const storeLegacyRecords = (page: Page) => page.evaluate(writeLegacyRecords);

const setGlobalMarkers = async (page: Page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await updateEditor(page);
  const edges = page.locator('.react-flow__edge');
  const firstEdge = edges.nth(0);
  const secondEdge = edges.nth(1);
  const width = page.getByRole('spinbutton', { name: 'Width' });
  await expect(edges).toHaveCount(2);
  await expect
    .poll(() => readMarker(firstEdge))
    .toEqual({ fill: 'rgb(23, 23, 23)', stroke: 'rgb(23, 23, 23)' });

  await openToolkit(page);
  await selectMarker(page, 'Open arrow');
  await setColorInput(page.getByLabel('Color', { exact: true }), '#ef4444');
  await page.getByRole('spinbutton', { name: 'Width' }).fill('99');
  await expect(width).toHaveValue('8');
  await expect(firstEdge.locator('.react-flow__edge-path')).toHaveCSS('stroke-width', '8px');
  await expect(secondEdge.locator('.react-flow__edge-path')).toHaveCSS('stroke-width', '8px');
  await expect
    .poll(() => readMarker(firstEdge))
    .toEqual({ fill: 'none', stroke: 'rgb(239, 68, 68)' });
  await expect
    .poll(() => readMarker(secondEdge))
    .toEqual({ fill: 'none', stroke: 'rgb(239, 68, 68)' });
  return { firstEdge, secondEdge, width };
};

const verifyReloadedEdgeMarkers = async (page: Page, firstEdge: Locator, secondEdge: Locator) => {
  await page.reload();
  await expect(firstEdge).toBeVisible();
  await page.getByRole('button', { name: 'Toolkit: 1 edge', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Marker', exact: true })).toHaveText('None');
  await expect.poll(() => readMarker(firstEdge)).toBeNull();
  await expect(firstEdge.locator('.react-flow__edge-path')).toHaveCSS('stroke', 'rgb(34, 197, 94)');
  await expect
    .poll(() => readMarker(secondEdge))
    .toEqual({ fill: 'none', stroke: 'rgb(239, 68, 68)' });
  await selectMarker(page, 'Filled arrow');
  await expect
    .poll(() => readMarker(firstEdge))
    .toEqual({ fill: 'rgb(34, 197, 94)', stroke: 'rgb(34, 197, 94)' });
};

const saveUnnamedGraph = async (page: Page) => {
  let reactFlowWarnings: string[] = [];

  page.on('console', (message) => {
    const text = message.text();
    const isReactFlowTypeMapWarning = text.includes(reactFlowTypeMapWarning);

    if (!isReactFlowTypeMapWarning) {
      return;
    }

    reactFlowWarnings = reactFlowWarnings.concat(text);
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await expect(page.locator('.react-flow__node-sequenceParticipant')).toHaveCount(5);
  expect(reactFlowWarnings).toHaveLength(0);
  await page.keyboard.press('Escape');
  const navigation = page.getByRole('navigation', { name: 'Saved graphs' });
  const graphButtons = navigation.locator('[data-sidebar="menu-button"]');
  const graphName = page.getByRole('button', { name: 'Rename graph', exact: true });
  await expect(graphButtons).toHaveCount(0);

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await expect(graphButtons).toHaveCount(1);
  await expect(graphButtons).toHaveText(/^[a-f0-9-]{36}$/);
  const savedId = await graphButtons.innerText();
  await expect(graphName).toHaveText(savedId);
  await page.reload();
  await expect(graphName).toHaveText(savedId);
  await graphName.click();
  const titleInput = page.getByRole('textbox', { name: 'Graph name', exact: true });
  await expect(titleInput).toHaveValue('');
  await titleInput.press('Escape');
  await expect(graphName).toHaveText(savedId);
  return { navigation, graphButtons, graphName };
};

const createRemainingVersions = async (page: Page, viewport: Locator, firstCamera: string) => {
  await editSnapshot(page, 2);
  const node = page.locator('.react-flow__node[data-id="A"]');
  await node.click();
  await page.getByRole('button', { name: 'Toolkit: 1 node' }).click();
  await setColorInput(page.getByLabel('Fill'), '#22c55e');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'zoom in', exact: true }).click();
  await expect(viewport).not.toHaveCSS('transform', firstCamera);
  await saveSnapshot(page, 2);
  await editSnapshot(page, 3);
  await saveSnapshot(page, 3);
  await editSnapshot(page, 4);
  await saveSnapshot(page, 4);
  await editSnapshot(page, 5);
  await saveSnapshot(page, 5);
  return node;
};

const createStyledVersion = async (page: Page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await editSnapshot(page, 1);
  await renameGraph(page, 'Versioned diagram');
  await page.getByRole('button', { name: 'Toolkit: Global' }).click();
  await setColorInput(page.getByLabel('Fill'), '#ef4444');
  await page.keyboard.press('Escape');
  await saveSnapshot(page, 1);
  const history = page.getByRole('region', { name: 'Version history' });
  const workspaceButton = page.getByRole('button', { name: 'Versioned diagram' });
  await expect(history).toBeVisible();
  await expect(workspaceButton).toHaveAttribute('aria-expanded', 'true');
  await workspaceButton.click();
  await expect(history).not.toBeVisible();
  await expect(workspaceButton).toHaveAttribute('aria-expanded', 'false');
  await workspaceButton.click();
  await expect(history).toBeVisible();
  const viewport = page.locator('.react-flow__viewport');
  const firstCamera = await viewport.evaluate((element) => getComputedStyle(element).transform);
  return { history, viewport, firstCamera };
};

const expectSidebarCredits = async (page: Page, header: Locator, sidebar: Locator) => {
  await expect(
    sidebar.locator('[data-sidebar="header"]').getByText('m2rd', { exact: true }),
  ).toBeVisible();
  await expect(sidebar.getByRole('heading', { name: 'Saved graphs', exact: true })).toBeVisible();
  const footer = sidebar.locator('[data-sidebar="footer"]');
  await expect(footer.getByRole('link', { name: 'm2rd', exact: true })).toHaveAttribute(
    'href',
    repository.url,
  );
  await expect(
    footer.getByText(
      'm2rd currently supports flow, sequence, state, class, ER, and Gantt diagrams; more soon! made with:',
      { exact: true },
    ),
  ).toBeVisible();
  const footerMetadata = `v${version} · ${license} · ${new Date().getFullYear()}`;
  await expect(footer.getByText(footerMetadata, { exact: true })).toBeVisible();
  await expect(
    header.getByRole('link', { name: 'GitHub repository', exact: true }),
  ).toHaveAttribute('href', repository.url);
  await expect(footer.getByRole('heading')).toHaveCount(0);
  const credits = footer.getByRole('list', { name: 'Open-source credits' });
  await expectThreeCreditLines(footer);
  expect(
    await credits
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => [link.textContent, link.getAttribute('href')])),
  ).toEqual([
    ['Mermaid', 'https://mermaid.js.org/'],
    ['React Flow', 'https://reactflow.dev/'],
    ['XState', 'https://stately.ai/docs/xstate'],
    ['Effect', 'https://effect.website/'],
    ['shadcn/ui', 'https://ui.shadcn.com/'],
    ['Codex', 'https://github.com/openai/codex'],
    ['Tailwind CSS', 'https://tailwindcss.com/'],
    ['Next.js', 'https://nextjs.org/'],
    ['Dexie', 'https://dexie.org/'],
  ]);
};

const expectHeaderActions = async (page: Page, header: Locator) => {
  const names = await header
    .getByRole('button')
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute('aria-label') || button.textContent?.trim()),
    );
  expect(names).toEqual(['Toggle Sidebar', 'New', 'Rename graph', 'Save', 'Download', 'Delete']);
  const actions = header.locator('button[aria-label]').filter({ has: page.locator('svg') });
  await expect(actions).toHaveCount(3);
  expect(await actions.allTextContents()).toEqual(['', '', '']);
  const classes = await actions.evaluateAll((buttons) => buttons.map((button) => button.className));
  expect(
    classes.every((value) => {
      const tokens = new Set(value.split(/\s+/));
      const matches = !tokens.has('bg-background') && tokens.has('h-7') && tokens.has('w-7');
      return matches;
    }),
  ).toBe(true);
  await expect(header.getByRole('heading', { name: 'm2rd', exact: true })).toBeVisible();

  const create = header.getByRole('button', { name: 'New', exact: true });
  const sidebarTrigger = header.getByRole('button', { name: 'Toggle Sidebar' });
  await expect(sidebarTrigger).toHaveCSS('width', '28px');
  await expect(sidebarTrigger).toHaveCSS('height', '28px');
  await expect(sidebarTrigger.locator('svg')).toHaveCSS('width', '16px');
  await expect(sidebarTrigger.locator('svg')).toHaveCSS('height', '16px');
  await create.hover();
  await expect(page.getByRole('tooltip')).toHaveText('New');
  await page.mouse.move(0, 0);
  await create.focus();
  await expect(page.getByRole('tooltip')).toHaveText('New');
  const save = header.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toHaveText('save(⌃s / ⌘s)');
  await expect(save).toHaveAttribute('aria-keyshortcuts', 'Control+s Meta+s');
  await save.click();
  await expect(header.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await header.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['SVG', 'PNG', 'GIF loop', 'GIF once']);
  await page.keyboard.press('Escape');
};

const { license, repository, version } = packageMetadata;

const source = `flowchart LR
  Alpha[Write Mermaid] --> Beta[Build graph]
  Beta --> Gamma[React Flow preview]
`;
const sequenceSource = `sequenceDiagram
  participant A as Alice
  participant B as Bob
  A->>B: Hello
  B-->>A: Hi
  A->>A: Think
`;
const reactFlowTypeMapWarning = 'created a new nodeTypes or edgeTypes object';

const updateEditor = async (page: Page, content = source) => {
  const editor = page.locator('.cm-content');

  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(content);
};

const createNewGraph = async (page: Page) => {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sequence', exact: true }).click();
};

const setColorInput = async (locator: Locator, value: string) => {
  await locator.evaluate((element, color) => {
    const input = element as HTMLInputElement;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

    descriptor?.set?.call(input, color);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
};

const getBounds = async (locator: Locator) => {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  return bounds!;
};

const selectDownload = async (page: Page, name: string) => {
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
};

const selectMarker = async (page: Page, name: string) => {
  await page.getByRole('combobox', { name: 'Marker', exact: true }).click();
  await page.getByRole('option', { name, exact: true }).click();
};

const openToolkit = async (page: Page) => {
  const background = page.getByRole('combobox', { name: 'Background', exact: true });
  const isOpen = await background.isVisible();
  if (!isOpen) await page.getByRole('button', { name: 'Toolkit: Global', exact: true }).click();
  await expect(background).toBeVisible();
};

const readMarker = (edge: Locator) => {
  return edge.locator('.react-flow__edge-path').evaluate((path) => {
    const reference = path.getAttribute('marker-end') || '';
    const id = reference.match(/#([^'")]+)/)?.[1];
    const marker = id ? document.getElementById(id) : null;
    const shape = marker?.querySelector('polyline');
    if (!shape) {
      return null;
    }

    const { fill, stroke } = getComputedStyle(shape);
    return { fill, stroke };
  });
};

const versionSource = (version: number) => {
  return `flowchart LR\n  A[Snapshot ${version}] --> B[Saved graph]`;
};

const saveSnapshot = async (page: Page, version: number) => {
  await page.getByRole('button', { name: /^(Save|Saved)$/ }).click();
  const history = page.getByRole('region', { name: 'Version history' });
  await expect(
    history.getByRole('button', { name: new RegExp(`^v${version}\\b`) }),
  ).toHaveAttribute('aria-pressed', 'true');
};

const editSnapshot = async (page: Page, version: number) => {
  await updateEditor(page, versionSource(version));
  await expect(
    page.locator('.react-flow__node').filter({ hasText: `Snapshot ${version}` }),
  ).toBeVisible();
};

const renameGraph = async (page: Page, name: string) => {
  const title = page.getByRole('button', { name: 'Rename graph', exact: true });
  await title.click();
  const graphName = page.getByRole('textbox', { name: 'Graph name', exact: true });
  await page.getByRole('textbox', { name: 'Graph name', exact: true }).fill(name);
  await graphName.press('Enter');
  await expect(title).toHaveText(name);
};

const saveNamedGraph = async (page: Page, name: string) => {
  await renameGraph(page, name);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
};

const openSavedGraphs = async (page: Page) => {
  const navigation = page.getByRole('navigation', { name: 'Saved graphs' });
  const heading = page.getByRole('heading', { name: 'Saved graphs', exact: true });
  const isVisible = await heading.isVisible();
  const collapsed = await page.locator('[data-state="collapsed"][data-side="left"]').count();
  const shouldOpen = !isVisible || collapsed > 0;
  if (shouldOpen) await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  await expect(heading).toBeInViewport();
  return navigation;
};

const expectThreeCreditLines = async (footer: Locator) => {
  const rows = footer
    .getByRole('list', { name: 'Open-source credits' })
    .locator(':scope > li > ul');
  await expect(rows).toHaveCount(3);
  const lineCounts = await rows.evaluateAll((elements) =>
    elements.map((element) => {
      const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
      return element.getBoundingClientRect().height / lineHeight;
    }),
  );
  expect(lineCounts).toEqual([1, 1, 1]);
  await expect(rows.nth(0).getByRole('link')).toHaveText(['Mermaid', 'React Flow', 'XState']);
  await expect(rows.nth(1).getByRole('link')).toHaveText(['Effect', 'shadcn/ui', 'Codex']);
  await expect(rows.nth(2).getByRole('link')).toHaveText(['Tailwind CSS', 'Next.js', 'Dexie']);
};

const createScrollableGraphList = async (page: Page) => {
  const names = Array.from({ length: 12 }, (_, index) => `Saved graph ${index + 1}`);
  await names.reduce(async (previous, name, index) => {
    await previous;
    const needsNewGraph = index > 0;
    if (needsNewGraph) await createNewGraph(page);
    await saveNamedGraph(page, name);
  }, Promise.resolve());
};

[
  { name: 'desktop', viewport: { width: 1440, height: 640 } },
  { name: 'mobile', viewport: { width: 320, height: 640 } },
].forEach(({ name, viewport }) => {
  test.describe(`sidebar ${name}`, () => {
    test.use({ viewport });

    test(
      'opens without saved graphs and remains available after deleting the last graph',
      checkSidebarLifecycle,
    );

    test(
      'scrolls saved graphs independently and keeps the final graph clickable above the footer',
      checkSidebarScrolling,
    );
  });
});

test('shows minimal navigation with tooltips and OSS credits', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await expect(page.locator('.react-flow__node-sequenceParticipant')).toHaveCount(5);
  const header = page.locator('header');
  await expectHeaderActions(page, header);
  const sidebar = page.locator('[data-sidebar="sidebar"]');
  await expectSidebarCredits(page, header, sidebar);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: testInfo.outputPath('desktop-navigation.png') });
  const close = sidebar.getByRole('button', { name: 'Close sidebar', exact: true });
  await close.focus();
  await close.press('Enter');
  await expect(page.locator('[data-state="collapsed"][data-side="left"]')).toBeVisible();
  await header.getByRole('button', { name: 'Toggle Sidebar' }).press('Enter');
  await expect(page.locator('[data-state="expanded"][data-side="left"]')).toBeVisible();
});

test('keeps navigation and sidebar reachable with a long title on mobile', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('./');
  await expect(page.locator('.react-flow__node-sequenceParticipant')).toHaveCount(5);
  await renameGraph(
    page,
    'A long graph title that must not hide any navigation actions on a narrow screen',
  );
  const header = page.locator('header');
  const create = await getBounds(header.getByRole('button', { name: 'New', exact: true }));
  const title = await getBounds(header.getByRole('button', { name: 'Rename graph', exact: true }));
  const save = await getBounds(header.getByRole('button', { name: 'Save', exact: true }));
  const download = await getBounds(header.getByRole('button', { name: 'Download', exact: true }));
  const remove = await getBounds(header.getByRole('button', { name: 'Delete', exact: true }));
  expect(create.x + create.width).toBeLessThanOrEqual(title.x);
  expect(title.x + title.width).toBeLessThanOrEqual(save.x);
  expect(download.x + download.width).toBeLessThanOrEqual(remove.x);
  expect(remove.x + remove.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath('mobile-navigation.png') });
  await header.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'SVG', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await header.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(header.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await header.getByRole('button', { name: 'Toggle Sidebar' }).click();
  const drawer = page.getByRole('dialog', { name: 'Sidebar', exact: true });
  await expect(drawer.getByRole('button', { name: 'Close sidebar', exact: true })).toHaveCount(1);
  await drawer.getByRole('list', { name: 'Open-source credits' }).scrollIntoViewIfNeeded();
  await expect(drawer.getByRole('link', { name: 'shadcn/ui', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('mobile-navigation-sidebar.png') });
  await drawer.getByRole('button', { name: 'Close sidebar', exact: true }).click();
  await expect(drawer).toBeHidden();
  await header.getByRole('button', { name: 'Toggle Sidebar' }).press('Enter');
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'Close sidebar', exact: true }).press('Enter');
  await expect(drawer).toBeHidden();
});

test('edits titles with keyboard confirmation, cancellation and blank validation', async ({
  page,
}) => {
  await page.goto('./');
  const title = page.getByRole('button', { name: 'Rename graph', exact: true });
  const graphName = page.getByRole('textbox', { name: 'Graph name', exact: true });
  await expect(title).toHaveText('Untitled graph');
  await title.focus();
  await title.press('Enter');
  await expect(graphName).toBeFocused();
  await expect(graphName).toHaveValue('');
  await graphName.pressSequentially('Release plan ');
  await expect(graphName).toHaveValue('Release plan ');
  await graphName.press('Enter');
  await expect(title).toHaveText('Release plan');
  await expect(title).toBeFocused();
  await expect(page.getByRole('button', { name: 'Toggle Sidebar' })).toBeVisible();
  await title.click();
  const selection = await graphName.evaluate((element: HTMLInputElement) => [
    element.selectionStart,
    element.selectionEnd,
  ]);
  expect(selection).toEqual([0, 'Release plan'.length]);
  await page.getByRole('textbox', { name: 'Graph name', exact: true }).fill('Discard this');
  await graphName.press('Escape');
  await expect(title).toHaveText('Release plan');
  await expect(title).toBeFocused();
  await title.click();
  await page.getByRole('textbox', { name: 'Graph name', exact: true }).fill('   ');
  await graphName.press('Enter');
  await expect(graphName).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert').filter({ hasText: 'Enter a graph name.' })).toBeVisible();
  await graphName.press('Escape');
  await expect(title).toHaveText('Release plan');
});

test('restores the last confirmed title on blur without adding a diagram version', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.locator('.react-flow__node-sequenceParticipant')).toHaveCount(5);
  await saveSnapshot(page, 1);
  const title = page.getByRole('button', { name: 'Rename graph', exact: true });
  const history = page.getByRole('region', { name: 'Version history' });
  const previousName = await title.innerText();
  await title.click();
  await page.getByRole('heading', { name: 'm2rd', exact: true }).click();
  await expect(title).toHaveText(previousName);
  await renameGraph(page, 'Road map');
  await title.click();
  await page.getByRole('textbox', { name: 'Graph name', exact: true }).fill('');
  await page.getByRole('heading', { name: 'm2rd', exact: true }).click();
  await expect(title).toHaveText('Road map');
  await expect(page.getByRole('textbox', { name: 'Graph name', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: 'Enter a graph name.' })).toHaveCount(0);
  const navigation = page.getByRole('navigation', { name: 'Saved graphs' });
  await expect(navigation.getByRole('button', { name: 'Road map', exact: true })).toBeVisible();
  await expect(history.getByRole('button')).toHaveCount(1);
  await page.reload();
  await expect(title).toHaveText('Road map');
  await expect(history.getByRole('button')).toHaveCount(1);
  await title.click();
  await page.getByRole('textbox', { name: 'Graph name', exact: true }).fill('Final road map');
  await createNewGraph(page);
  await expect(title).toHaveText('Untitled graph');
  await expect(navigation.getByRole('button', { name: 'Final road map', exact: true })).toHaveCount(
    0,
  );
  await expect(navigation.getByRole('button', { name: 'Road map', exact: true })).toBeVisible();
});

test('restores version styling and saves the oldest as newest while keeping five', async ({
  page,
}, testInfo) => {
  const { history, viewport, firstCamera } = await createStyledVersion(page);
  const node = await createRemainingVersions(page, viewport, firstCamera);
  await expect(history.getByRole('button')).toHaveCount(5);
  await history.getByRole('button', { name: /^v1\b/ }).click();
  await expect(page.locator('.cm-content')).toContainText('Snapshot 1');
  await expect(node).toHaveCSS('background-color', 'rgb(239, 68, 68)');
  await expect(viewport).toHaveCSS('transform', firstCamera);
  await editSnapshot(page, 6);
  await saveSnapshot(page, 6);
  await expect(history.getByRole('button').locator('span')).toHaveText([
    'v6',
    'v5',
    'v4',
    'v3',
    'v2',
  ]);
  await page.screenshot({ path: testInfo.outputPath('version-history-desktop.png') });

  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('Snapshot 6');
  await page.keyboard.press('Escape');
  await expect(history.getByRole('button', { name: /^v6\b/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await history.getByRole('button', { name: /^v2\b/ }).click();
  await expect(node).toHaveCSS('background-color', 'rgb(34, 197, 94)');
  await expect(page.locator('.cm-content')).toContainText('Snapshot 2');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  const drawer = page.getByRole('dialog', { name: 'Sidebar', exact: true });
  await expect(drawer.getByRole('button', { name: /^v6\b/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('version-history-mobile.png') });
  await drawer.getByRole('button', { name: /^v6\b/ }).click();
  await expect(drawer).toBeHidden();
  await expect(page.locator('.cm-content')).toContainText('Snapshot 6');
});

test('lists, renames, switches, and deletes saved graphs in the sidebar', async ({
  page,
}, testInfo) => {
  const { navigation, graphButtons, graphName } = await saveUnnamedGraph(page);
  await renameGraph(page, 'Release plan');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(navigation.getByRole('button', { name: 'Release plan' })).toBeVisible();
  await createNewGraph(page);
  await expect(graphName).toHaveText('Untitled graph');
  await renameGraph(page, 'API dependencies');
  await updateEditor(page);
  await expect(page.locator('[data-id="Alpha"]')).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(graphButtons).toHaveCount(2);

  await navigation.getByRole('button', { name: 'Release plan' }).click();
  await expect(graphName).toHaveText('Release plan');
  await expect(page.locator('.cm-content')).toContainText('Install command via shell hook');
  await expect(navigation.getByRole('button', { name: 'Release plan' })).toHaveAttribute(
    'data-active',
    'true',
  );
  await page.reload();
  await expect(graphButtons).toHaveCount(2);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Download', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('sidebar-downloads.png') });
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  await expect(navigation).not.toBeInViewport();
  await createNewGraph(page);
  await expect(navigation).not.toBeInViewport();
  await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  await expect(navigation).toBeInViewport();
  await navigation.getByRole('button', { name: 'Release plan' }).click();
  await expect(graphName).toHaveText('Release plan');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(graphButtons).toHaveCount(1);
  await expect(navigation.getByRole('button', { name: 'API dependencies' })).toBeVisible();
});

test('changes edge markers and matching colors globally and per edge, then restores them', async ({
  page,
}, testInfo) => {
  const { firstEdge, secondEdge, width } = await setGlobalMarkers(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'fit view', exact: true }).click();
  await firstEdge.click();
  await page.getByRole('button', { name: 'Toolkit: 1 edge', exact: true }).click();
  await selectMarker(page, 'Filled arrow');
  await setColorInput(page.getByLabel('Color', { exact: true }), '#2563eb');
  await page.getByRole('spinbutton', { name: 'Width' }).fill('0');
  await expect(width).toHaveValue('1');
  await expect(firstEdge.locator('.react-flow__edge-path')).toHaveCSS('stroke', 'rgb(37, 99, 235)');
  await expect
    .poll(() => readMarker(firstEdge))
    .toEqual({ fill: 'rgb(37, 99, 235)', stroke: 'rgb(37, 99, 235)' });
  await expect
    .poll(() => readMarker(secondEdge))
    .toEqual({ fill: 'none', stroke: 'rgb(239, 68, 68)' });
  await page.screenshot({ path: testInfo.outputPath('edge-markers.png') });

  await selectMarker(page, 'None');
  await setColorInput(page.getByLabel('Color', { exact: true }), '#22c55e');
  await expect.poll(() => readMarker(firstEdge)).toBeNull();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await verifyReloadedEdgeMarkers(page, firstEdge, secondEdge);
});

test('loads legacy marker colors, oversized edges, and untitled names', async ({ page }) => {
  await page.goto('./');
  await updateEditor(page);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await storeLegacyRecords(page);
  await page.reload();
  const firstEdge = page.locator('.react-flow__edge').first();
  await expect
    .poll(() => readMarker(firstEdge))
    .toEqual({ fill: 'rgb(168, 85, 247)', stroke: 'rgb(168, 85, 247)' });
  await expect(firstEdge.locator('.react-flow__edge-path')).toHaveCSS('stroke-width', '8px');
  const graphName = page.getByRole('button', { name: 'Rename graph', exact: true });
  await expect(graphName).toHaveText(/^[a-f0-9-]{36}$/);
  await page.getByRole('button', { name: 'Toolkit: Global', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Marker', exact: true })).toHaveText(
    'Filled arrow',
  );
});

test('renders sequence diagrams as React Flow elements', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await updateEditor(page, sequenceSource);

  const alice = page.locator('.react-flow__node[data-id="A"]');
  await expect(alice).toContainText('Alice');
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  await expect(page.getByTestId('rf__wrapper').getByText('Hello', { exact: true })).toBeVisible();
  await expect(alice.getByText('Alice', { exact: true })).toHaveCount(2);
  await expect(alice).toHaveCSS('background-image', 'none');
  const participantFill = await page.evaluate(() => {
    const swatch = document.createElement('div');
    swatch.style.backgroundColor = 'var(--color-gray-100)';
    document.body.append(swatch);
    const color = getComputedStyle(swatch).backgroundColor;
    swatch.remove();
    return color;
  });
  await expect(alice.locator('.z-10 > div').first()).toHaveCSS('background-color', participantFill);

  await updateEditor(page, sequenceSource.replace('A->>B: Hello', 'A-->>B: Hello'));
  const firstMessage = page
    .getByRole('button', { name: 'Edge from A to action-message-i0', exact: true })
    .locator('.react-flow__edge-path');
  await expect(firstMessage).toHaveCSS('stroke-dasharray', '6px, 4px');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.react-flow__node[data-id="A"]')).toContainText('Alice');
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  await expect(page.locator('.cm-content')).toContainText('A-->>B: Hello');
  await expect(firstMessage).toHaveCSS('stroke-dasharray', '6px, 4px');
});

test('opens render error details on request and keeps the editor usable', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.react-flow__node-sequenceParticipant')).toHaveCount(5);
  await updateEditor(
    page,
    `pie title Pets
  "Dogs" : 45
  "Cats" : 55
`,
  );

  const viewError = page.getByRole('button', { name: 'View error', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Mermaid error' });
  await expect(viewError).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await viewError.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('not supported in the React Flow view yet');
  await expect(page.locator('.cm-content')).toContainText('pie title Pets');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await viewError.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(page.locator('.react-flow__node-sequenceParticipant')).toHaveCount(5);
});

test('starts new diagrams with default styles and canvas settings', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await updateEditor(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await openToolkit(page);
  await setColorInput(page.getByLabel('Fill'), '#ef4444');
  await page.getByRole('combobox', { name: 'Background', exact: true }).click();
  await page.getByRole('option', { name: 'Diagonal v3', exact: true }).click();
  await createNewGraph(page);
  await expect(page.locator('.react-flow__node-sequenceParticipant')).toHaveCount(5);
  await updateEditor(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await openToolkit(page);

  await expect(page.getByLabel('Fill')).toHaveValue('#cccccc');
  await expect(page.getByRole('combobox', { name: 'Surface', exact: true })).toHaveText('Solid');
  await expect(page.getByRole('combobox', { name: 'Background', exact: true })).toHaveText('None');
  await expect(page.getByRole('switch', { name: 'Show grid', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(page.locator('.react-flow__node').first()).toHaveCSS(
    'background-color',
    'rgb(204, 204, 204)',
  );
  await expect(page.locator('.react-flow__node').first()).toHaveCSS('background-image', 'none');
});

test('supports no canvas background', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await openToolkit(page);
  await page.getByRole('combobox', { name: 'Background', exact: true }).click();
  await page.getByRole('option', { name: 'None', exact: true }).click();

  await expect(page.getByRole('combobox', { name: 'Background', exact: true })).toHaveText('None');
  await expect(page.getByLabel('Density')).toHaveCount(0);
});

test('opens the saved graph drawer and closes it after selection on mobile', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.locator('.react-flow__node-sequenceParticipant')).toHaveCount(5);
  await page.keyboard.press('Escape');
  await renameGraph(page, 'Mobile graph');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await createNewGraph(page);
  await page.getByRole('button', { name: 'Toggle Sidebar' }).click();

  const drawer = page.getByRole('dialog', { name: 'Sidebar', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Mobile graph' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile-sidebar.png') });
  await drawer.getByRole('button', { name: 'Mobile graph' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('button', { name: 'Rename graph', exact: true })).toHaveText(
    'Mobile graph',
  );
  await expect(page.locator('.cm-content')).toContainText('Install command via shell hook');
});

test('resizes the editor and canvas with pointer and keyboard', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await updateEditor(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge-path')).toHaveCount(2);
  await page.keyboard.press('Escape');

  const editor = page.locator('#mermaid-panel');
  const canvas = page.locator('#flow-panel');
  const handle = page.getByRole('separator', { name: 'Resize Mermaid and React Flow panels' });
  await resizePanelsWithPointer(page, editor, canvas, handle);
  const editorAfterDrag = await getBounds(editor);
  await handle.focus();
  await page.keyboard.press('ArrowLeft');
  await expect
    .poll(async () => (await getBounds(editor)).width)
    .toBeLessThan(editorAfterDrag.width);

  await updateEditor(page);
  await expect(
    page.locator('.react-flow__node').filter({ hasText: 'Write Mermaid' }),
  ).toBeVisible();
  await expect(page.locator('.react-flow__edge-path')).toHaveCount(2);
  await page.getByRole('button', { name: 'fit view', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('desktop-resizable.png') });

  await createNewGraph(page);
  await expect(page.locator('#workspace-panels')).toHaveCSS('flex-direction', 'row');
});

test('stacks the editor above the canvas on mobile', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.keyboard.press('Escape');
  await expect(page.locator('.react-flow__node-sequenceParticipant')).toHaveCount(5);
  await expect(page.locator('#workspace-panels')).toHaveCSS('flex-direction', 'column');
  await expect(page.getByRole('separator', { includeHidden: true })).toBeHidden();

  const editor = await getBounds(page.locator('#mermaid-panel'));
  const canvas = await getBounds(page.locator('#flow-panel'));
  const editorBottom = editor.y + editor.height;
  expect(canvas.y).toBeGreaterThanOrEqual(editorBottom);
  expect(canvas.height).toBeGreaterThanOrEqual(520);
  expect(editor.height).toBeGreaterThanOrEqual(520);
  const hasHorizontalOverflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth;
  });
  expect(hasHorizontalOverflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('mobile-stacked.png'), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('#workspace-panels')).toHaveCSS('flex-direction', 'row');
  await expect(
    page.getByRole('separator', { name: 'Resize Mermaid and React Flow panels' }),
  ).toBeVisible();
});

test('saves selected node visual edits after Mermaid update', async ({ page }) => {
  await expectRedactedInputEvent(page);
  const node = page.locator('.react-flow__node').filter({
    hasText: 'Write Mermaid',
  });

  await expect(node).toBeVisible();
  await page.getByRole('button', { name: 'fit view', exact: true }).click();
  await node.click();
  await expect(page.getByText('Node selected')).toBeVisible();

  await page.getByRole('button', { name: 'Toolkit: 1 node' }).click();
  await setColorInput(page.getByLabel('Fill'), '#ef4444');
  await expect(node).toHaveCSS('background-color', 'rgb(239, 68, 68)');

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();

  await page.reload();

  const reloadedNode = page.locator('.react-flow__node').filter({
    hasText: 'Write Mermaid',
  });

  await expect(reloadedNode).toHaveCSS('background-color', 'rgb(239, 68, 68)');
  await reloadedNode.click();
  await expect(page.getByText('Node selected')).toBeVisible();
  await page.getByRole('button', { name: 'Toolkit: 1 node', exact: true }).click();
  await expect(page.getByLabel('Fill')).toBeVisible();
  await expect(page.getByLabel('Fill')).toHaveValue('#ef4444');

  await expectStyledSvgExport(page);
  await expectPngExport(page);
  await expectLoopingGifExport(page);
  const onceDownloadPromise = page.waitForEvent('download');

  await selectDownload(page, 'GIF once');

  const onceDownload = await onceDownloadPromise;
  const onceOutputPath = '.next/cache/playwright/export-once.gif';

  await onceDownload.saveAs(onceOutputPath);

  const onceGif = await readFile(onceOutputPath);

  expect(onceDownload.suggestedFilename()).toBe('m2rd-graph.gif');
  expect(onceGif.subarray(0, 6).toString('ascii')).toBe('GIF89a');
  expect(onceGif.toString('latin1')).not.toContain('NETSCAPE2.0');
});
