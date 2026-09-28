import { expect, test, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const moveClassNode = async (page: Page, node: Locator) => {
  const before = await node.getAttribute('style');
  const edge = page.locator('.react-flow__edge-path');
  const path = await edge.getAttribute('d');
  const bounds = await node.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2 + 30, bounds!.y + bounds!.height / 2 + 25, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(node).not.toHaveAttribute('style', before!);
  await expect(edge).not.toHaveAttribute('d', path!);
  const moved = await node.getAttribute('style');
  return moved;
};

const expectClassGeometry = async (page: Page) => {
  const markers = page.locator('marker[data-class-marker]');
  await expect(markers.locator('[fill]')).toHaveCount(9);
  const paths = page.locator('.react-flow__edge-path');
  await expect(
    paths.locator('xpath=..').filter({ has: page.locator('marker[data-class-marker="lollipop"]') }),
  ).toHaveCount(1);
  const geometry = await page.locator('.react-flow__node').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      const hasSize = rect.width > 0 && rect.height > 0;
      const invalid = node.getAttribute('style')?.includes('NaN');
      const valid = hasSize && !invalid;
      return valid;
    }),
  );
  expect(geometry.every(Boolean)).toBe(true);
  const references = await paths.evaluateAll((elements) => {
    const references = elements.flatMap((element) => [
      element.getAttribute('marker-start'),
      element.getAttribute('marker-end'),
    ]);
    return references.filter(Boolean).map((reference) => {
      const id = decodeURIComponent(reference!.slice(5, -1));
      return document.getElementById(id)?.tagName === 'marker';
    });
  });
  expect(references).toHaveLength(9);
  expect(references.every(Boolean)).toBe(true);
};

const expectClassMembers = async (page: Page) => {
  const generic = page.locator('.react-flow__node[data-id="class:A"]');
  await expect(generic).toContainText('A<T>');
  await expect(generic).toContainText('«interface»');
  await expect(generic).toContainText('+T value');
  await expect(generic).toContainText('-int count');
  await expect(generic).toContainText('#String label');
  await expect(generic).toContainText('~bool active');
  await expect(generic.getByText('+get() : T', { exact: true })).toHaveCSS('font-style', 'italic');
  await expect(generic.getByText('+create() : A', { exact: true })).toHaveCSS(
    'text-decoration-line',
    'underline',
  );
  await expect(generic.locator('[data-class-shape]')).toHaveCSS(
    'background-color',
    'rgb(255, 204, 204)',
  );
  await expect(page.locator('[data-id="class:B"] [data-class-shape]')).toHaveCSS(
    'background-color',
    'rgb(204, 255, 204)',
  );
  await expect(page.locator('[data-id="class:B"] [data-class-shape]')).toHaveCSS(
    'border-top-width',
    '3px',
  );
};

const nested = `classDiagram
    namespace Outer {
      namespace Inner {
        class A
      }
      class B
    }
    A --> B
`;

const source = `classDiagram
    direction LR
    namespace Collections {
        namespace Internal {
            class A~T~ {
                <<interface>>
                +T value
                -int count
                #String label
                ~bool active
                +get() T*
                +create() A$
            }
        }
        class B
    }
    class C
    class D
    A <|-- B : inheritance
    B "1" *-- "0..*" C : composition
    C o-- D : aggregation
    A --> D : association
    B -- D : link
    C ..> A : dependency
    D ..|> A : realization
    B .. C : dashed
    C o--o D : both ends
    B --() Port
    note for A "Generic contract"
    style A fill:#ffcccc,color:#333333,stroke:#990000
    cssClass "B" highlighted
    classDef highlighted fill:#ccffcc,stroke:#009900,stroke-width:3px
`;

const updateSource = async (page: Page, value: string) => {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(value);
};

const chooseClass = async (page: Page) => {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Class diagram', exact: true }).click();
  await expect(page.locator('[data-class-shape="classBox"]')).toHaveCount(2);
};

test('selects the doubly linked list sample without replacing saved work', async ({
  page,
}, testInfo) => {
  await page.goto('./');
  await expect(page.locator('.react-flow__node-sequenceParticipant')).toHaveCount(5);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('[data-sidebar="menu-button"]')).toHaveCount(1);
  await chooseClass(page);
  const classes = page.locator('[data-class-shape="classBox"]');
  await expect(classes).toContainText(['DoublyLinkedList<T>', 'ListNode<T>']);
  await expect(classes.first()).toContainText('head');
  await expect(classes.first()).toContainText('tail');
  await expect(classes.last()).toContainText('prev');
  await expect(classes.last()).toContainText('next');
  await expect(page.locator('.react-flow__edge-classRelation')).toHaveCount(2);
  await expect(page.locator('[data-class-cardinalities]')).toContainText(['10..*', '0..10..1']);
  await expect(page.locator('[data-sidebar="menu-button"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'View error', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('class-sample.png') });
  expect(await page.pageErrors()).toEqual([]);
});

test('guards the real Mermaid class metadata and SVG contract', async ({ page }, testInfo) => {
  await page.goto('./');
  await updateSource(page, source);
  await expect(page.locator('[data-class-shape="classBox"]')).toHaveCount(4);
  await expect(page.locator('[data-class-shape="namespace"]')).toHaveCount(2);
  await expect(page.locator('[data-class-shape="namespace"]').first()).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );
  await expect(page.locator('[data-class-shape="note"]')).toHaveText('Generic contract');
  await expect(page.locator('[data-class-shape="interface"]')).toHaveText('Port');
  await expect(page.locator('.react-flow__edge-classRelation')).toHaveCount(11);
  await expectClassMembers(page);
  await expectClassGeometry(page);
  await page.getByRole('button', { name: 'fit view', exact: true }).click();
  const fits = () =>
    page.locator('.react-flow').evaluate((canvas) => {
      const bounds = canvas.getBoundingClientRect();
      return Array.from(canvas.querySelectorAll('.react-flow__node')).every((node) => {
        const rect = node.getBoundingClientRect();
        const fitsWidth = rect.left >= bounds.left && rect.right <= bounds.right;
        const fitsHeight = rect.top >= bounds.top && rect.bottom <= bounds.bottom;
        return fitsWidth && fitsHeight;
      });
    });
  await expect.poll(fits).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('class-contract.png') });
  expect(await page.pageErrors()).toEqual([]);
});

test('keeps class semantics, movement, and appearance through save, reload, and source edits', async ({
  page,
}) => {
  await page.goto('./');
  await updateSource(page, 'classDiagram\n direction LR\n A "1" *-- "many" B : owns');
  const node = page.locator('.react-flow__node[data-id="class:A"]');
  await expect(node).toBeVisible();
  await page.getByRole('button', { name: 'fit view', exact: true }).click();
  const moved = await moveClassNode(page, node);
  await node.click();
  await page.getByRole('button', { name: 'Toolkit: 1 node' }).click();
  await expect(page.getByLabel('Shape', { exact: true })).toHaveCount(0);
  await page.getByLabel('Fill', { exact: true }).fill('#ef4444');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await page.reload();
  await expect(node).toHaveAttribute('style', moved!);
  await expect(node.locator('[data-class-shape]')).toHaveCSS(
    'background-color',
    'rgb(239, 68, 68)',
  );
  await updateSource(
    page,
    'classDiagram\n direction LR\n A "2" o-- "one" B : shares\n A : +int count',
  );
  await expect(node).toContainText('+int count');
  await expect(page.locator('marker[data-class-marker="composition"]')).toHaveCount(0);
  await expect(page.locator('marker[data-class-marker="aggregation"]')).toHaveCount(1);
  await expect(page.locator('[data-class-cardinalities]')).toContainText('2one');
  await expect(node.locator('[data-class-shape]')).toHaveCSS(
    'background-color',
    'rgb(239, 68, 68)',
  );
  await page.getByRole('button', { name: 'Reset layout', exact: true }).click();
  await expect(node).not.toHaveAttribute('style', moved!);
  await expect(page.getByRole('button', { name: 'View error', exact: true })).toHaveCount(0);
});

test('honors nested and compact namespaces and direction with fresh source geometry', async ({
  page,
}) => {
  await page.goto('./');
  await updateSource(page, nested);
  await expect(page.locator('[data-class-shape="namespace"]')).toHaveCount(2);
  const geometry = await page
    .locator('.react-flow__node')
    .evaluateAll((nodes) =>
      Object.fromEntries(
        nodes.map((node) => [node.getAttribute('data-id'), node.getBoundingClientRect().toJSON()]),
      ),
    );
  expect(geometry['class:A'].x).toBeGreaterThan(geometry['class:Outer.Inner'].x);
  expect(geometry['class:A'].y).toBeGreaterThan(geometry['class:Outer.Inner'].y);
  expect(geometry['class:Outer.Inner'].x).toBeGreaterThan(geometry['class:Outer'].x);
  const compact = '---\nconfig:\n  class:\n    hierarchicalNamespaces: false\n---\n' + nested;
  await updateSource(page, compact);
  await expect(
    page.locator('[data-class-shape="namespace"]').filter({ hasText: 'Outer.Inner' }),
  ).toHaveCount(1);
  await updateSource(page, 'classDiagram\n direction LR\n Left --> Right');
  const left = page.locator('.react-flow__node[data-id="class:Left"]');
  const right = page.locator('.react-flow__node[data-id="class:Right"]');
  await expect(left).toBeVisible();
  expect((await right.boundingBox())!.x).toBeGreaterThan((await left.boundingBox())!.x);
  await updateSource(page, 'classDiagram\n direction TB\n Top --> Bottom');
  const top = page.locator('.react-flow__node[data-id="class:Top"]');
  const bottom = page.locator('.react-flow__node[data-id="class:Bottom"]');
  await expect(top).toBeVisible();
  expect((await bottom.boundingBox())!.y).toBeGreaterThan((await top.boundingBox())!.y);
});

test('keeps parallel relation appearance attached to its meaning after insertion and reordering', async ({
  page,
}) => {
  await page.goto('./');
  const owns = 'A "1" *-- "many" B : owns';
  const shares = 'A o-- B : shares';
  await updateSource(page, `classDiagram\n${owns}\n${shares}`);
  const edges = page.locator('.react-flow__edge-classRelation');
  const owned = edges.filter({ hasText: 'owns' });
  await expect(edges).toHaveCount(2);
  const originalId = await owned.getAttribute('data-testid');
  await owned.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Toolkit: 1 edge', exact: true }).click();
  await page.getByLabel('Color', { exact: true }).fill('#ef4444');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await page.reload();
  await expect(owned.locator('.react-flow__edge-path')).toHaveCSS('stroke', 'rgb(239, 68, 68)');
  await updateSource(page, `classDiagram\nA ..> B : uses\n${shares}\n${owns}\n${shares}`);
  await expect(edges).toHaveCount(4);
  await expect(owned).toHaveAttribute('data-testid', originalId!);
  await expect(owned.locator('.react-flow__edge-path')).toHaveCSS('stroke', 'rgb(239, 68, 68)');
  const others = page
    .locator('.react-flow__edge-classRelation', { hasNotText: 'owns' })
    .locator('.react-flow__edge-path');
  await expect(others.nth(0)).not.toHaveCSS('stroke', 'rgb(239, 68, 68)');
  await expect(others.nth(1)).not.toHaveCSS('stroke', 'rgb(239, 68, 68)');
  await expect(others.nth(2)).not.toHaveCSS('stroke', 'rgb(239, 68, 68)');
  const ids = await edges.evaluateAll((items) =>
    items.map((item) => item.getAttribute('data-testid')),
  );
  expect(new Set(ids).size).toBe(4);
  await updateSource(page, `classDiagram\n${owns}\n${shares}`);
  await expect(edges).toHaveCount(2);
  await expect(owned).toHaveAttribute('data-testid', originalId!);
  await expect(owned.locator('.react-flow__edge-path')).toHaveCSS('stroke', 'rgb(239, 68, 68)');
});

test('preserves computed SVG class styles without mistaking none for a dashed border', async ({
  page,
}) => {
  await page.goto('./');
  await page.addStyleTag({
    content: `[aria-hidden="true"] svg .label-container path {
      stroke: rgb(12, 34, 56);
      stroke-width: 4px;
      stroke-dasharray: 6px 3px;
      color: rgb(65, 43, 21);
    }`,
  });
  await updateSource(page, 'classDiagram\nclass Styled');
  const surface = page.locator('[data-class-shape="classBox"]');
  await expect(surface).toHaveText('Styled');
  await expect(surface).toHaveCSS('border-top-color', 'rgb(12, 34, 56)');
  await expect(surface).toHaveCSS('border-top-width', '4px');
  await expect(surface).toHaveCSS('border-top-style', 'dashed');
  await expect(surface).toHaveCSS('color', 'rgb(65, 43, 21)');
  await page.addStyleTag({
    content:
      '[aria-hidden="true"] svg .label-container path { stroke-dasharray: none; stroke-width: 0px; }',
  });
  await updateSource(page, 'classDiagram\nclass Solid');
  await expect(surface).toHaveText('Solid');
  await expect(surface).toHaveCSS('border-top-style', 'solid');
  await expect(surface).toHaveCSS('border-top-width', '0px');
});

test('preserves an explicitly disabled class border through save and reload', async ({ page }) => {
  await page.goto('./');
  await updateSource(page, 'classDiagram\nclass Bordered');
  const surface = page.locator('[data-class-shape="classBox"]');
  await expect(surface).toHaveText('Bordered');
  await expect(surface).toHaveCSS('border-top-style', 'solid');
  await expect(surface).not.toHaveCSS('border-top-width', '0px');
  await updateSource(page, 'classDiagram\nclass Borderless\nstyle Borderless stroke:none');
  await expect(surface).toHaveText('Borderless');
  await expect(surface).toHaveCSS('border-top-style', 'none');
  await expect(surface).toHaveCSS('border-top-width', '0px');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await page.reload();
  await expect(surface).toHaveText('Borderless');
  await expect(surface).toHaveCSS('border-top-style', 'none');
  await expect(surface).toHaveCSS('border-top-width', '0px');
});

test('exports native class compartments, markers, and cardinalities', async ({ page }) => {
  await page.goto('./');
  await chooseClass(page);
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'SVG', exact: true }).click();
  const download = await downloading;
  const svg = await readFile((await download.path())!, 'utf8');
  expect(svg).toContain('DoublyLinkedList');
  expect(svg).toContain('ListNode');
  expect(svg).toContain('0..*');
  expect(svg).toContain('data-class-marker="composition"');
  expect(svg).toContain('marker-start="url(#');
});

test('recovers from invalid class input and keeps interaction directives inert', async ({
  page,
}) => {
  await page.goto('./');
  await chooseClass(page);
  await updateSource(page, 'classDiagram\n class Broken {');
  const viewError = page.getByRole('button', { name: 'View error', exact: true });
  await expect(viewError).toBeVisible();
  await expect(page.locator('.cm-lintRange-error')).toBeVisible();
  await updateSource(
    page,
    'classDiagram\n class Safe\n click Safe href "https://example.com" "Tooltip"',
  );
  await expect(page.locator('[data-class-shape="classBox"]')).toHaveText('Safe');
  await expect(page.locator('.react-flow__node a')).toHaveCount(0);
  await expect(viewError).toHaveCount(0);
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(0);
  expect(await page.pageErrors()).toEqual([]);
});
