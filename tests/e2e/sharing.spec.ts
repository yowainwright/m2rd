import { expect, test, type Page } from '@playwright/test';

test('saves a guest edit through sign-in and forks a later edit in a separate browser context', async ({
  page,
  browser,
}) => {
  await stubGitHub(page, 901);
  await page.goto('./');
  await replaceMermaid(page, 'Author fixture');
  await editAuthorNode(page);
  const original = await saveAndSignIn(page);
  await expectCapturedColor(page, original);

  const recipient = await browser.newContext({ viewport: { width: 320, height: 640 } });
  try {
    const shared = await recipient.newPage();
    await stubGitHub(shared, 902);
    await shared.goto(new URL(new URL(original).pathname, page.url()).href);
    const originalNode = shared.locator('.react-flow__node').filter({ hasText: 'Author fixture' });
    await expect(originalNode).toHaveCSS('background-color', 'rgb(239, 68, 68)');
    await shared.reload();
    await expect(originalNode).toHaveCount(1);
    await shared.getByRole('button', { name: 'Toggle Sidebar' }).click();
    const savedGraphs = shared.getByRole('navigation', { name: 'Saved graphs' });
    await expect(savedGraphs.locator('button[aria-expanded]')).toHaveCount(1);
    await shared.getByRole('button', { name: 'Close sidebar', exact: true }).click();
    await replaceMermaid(shared, 'Recipient edit');
    await saveLocalEditAndReload(shared, 'Recipient edit');
    const fork = await saveAndSignIn(shared);
    expect(new URL(fork).pathname).not.toBe(new URL(original).pathname);
    const pagePath = new URL(new URL(original).pathname, page.url()).href;
    await page.goto(pagePath);
    await expect(
      page.locator('.react-flow__node').filter({ hasText: 'Author fixture' }),
    ).toHaveCount(1);
  } finally {
    await recipient.close();
  }
});

test('keeps snapshot pages within the active account when the session changes', async ({
  page,
}) => {
  await stubGitHub(page, 905);
  await page.goto('./');
  await replaceMermaid(page, 'Paged list');
  const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
  await signIn.click();
  await expect(page.getByRole('link', { name: 'Back to the editor' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue with GitHub' }).click();
  await expect(page.locator('.cm-content')).toContainText('Paged list');
  await expect(signIn).toHaveCount(0);
  const list = `${getFixtureApi()}/api/snapshots`;
  await stubAccountSwitch(page, list);
  const find = page.getByRole('button', { name: 'Find my GitHub snapshots' });
  if (!(await find.isVisible())) await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  await find.click();
  await page.getByRole('button', { name: 'Load more GitHub snapshots' }).click();
  await expect(page.getByRole('link', { name: 'First page graph' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Second page graph' })).toBeVisible();
  const more = page.getByRole('button', { name: 'Load more GitHub snapshots' });
  await more.click();
  await expect(page.getByRole('link', { name: 'New account graph' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'First page graph' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Second page graph' })).toHaveCount(0);
  await more.click();
  await expect(page.getByRole('link', { name: 'New account second page' })).toBeVisible();
  await expect(find).toBeVisible();
  await page.route(list, (route) => route.fulfill({ status: 401 }));
  await find.click();
  await expect(page.getByRole('link', { name: 'New account graph' })).toHaveCount(0);
  await expect(find).toHaveCount(0);
});

test('keeps newer edits through a delayed unauthorized save and sign-in', async ({ page }) => {
  await stubGitHub(page, 903);
  await page.goto('./');
  await replaceMermaid(page, 'Captured edit');
  const requested = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  await page.route(
    `${getFixtureApi()}/api/snapshots`,
    async (route) => {
      const response = await route.fetch();
      requested.resolve();
      await release.promise;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  try {
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Save to GitHub' }).click();
    await requested.promise;
    await replaceMermaid(page, 'Newer edit');
  } finally {
    release.resolve();
  }
  await page.getByRole('button', { name: 'Continue with GitHub' }).click();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Newer edit' })).toHaveCount(1);
  await expect(page.locator('.cm-content')).toContainText('Newer edit');
  await page.reload();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Newer edit' })).toHaveCount(1);
});

test('shows an unavailable shared-link error to a first-time visitor', async ({ page }) => {
  await page.goto(`./ffff-${'a'.repeat(40)}`);
  const dialog = page.getByRole('dialog', { name: 'Operation error' });
  await expect(dialog).toContainText('This saved graph is unavailable.');
  await dialog.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(dialog).toBeHidden();
});

test('discards an unconfirmed save after warning and shares the current edits with a new save ID', async ({
  page,
}) => {
  await stubGitHub(page, 904);
  await page.goto('./');
  await replaceMermaid(page, 'Saved baseline');
  await saveAndSignIn(page);
  await replaceMermaid(page, 'Unconfirmed edit');
  const previousSaveId = await failNextGitHubSave(page);
  await page.reload();
  await replaceMermaid(page, 'Restarted edit');
  const retry = await saveToGitHub(page, 'Retry GitHub save');
  expect(retry.status()).toBe(409);
  const pending = JSON.parse(retry.request().postDataJSON().snapshot);
  expect(pending.saveId).toBe(previousSaveId);
  await discardPendingSave(page);
  const saved = await saveToGitHub(page);
  expect(saved.ok()).toBe(true);
  const current = JSON.parse(saved.request().postDataJSON().snapshot);
  expect(current.saveId).not.toBe(previousSaveId);
  const { gistId, revision } = await saved.json();
  const restored = await page.request.get(`${getFixtureApi()}/api/snapshots/${gistId}/${revision}`);
  expect(restored.ok()).toBe(true);
  expect((await restored.json()).snapshot.records.input.source).toContain('Restarted edit');
});

const failNextGitHubSave = async (page: Page) => {
  const url = `${getFixtureApi()}/api/snapshots`;
  await page.route(url, (route) => route.abort('failed'), { times: 1 });
  const failed = page.waitForEvent('requestfailed', (request) => request.url() === url);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Save to GitHub', exact: true }).click();
  const request = await failed;
  return JSON.parse(request.postDataJSON().snapshot).saveId;
};

const saveToGitHub = async (page: Page, name = 'Save to GitHub') => {
  const response = page.waitForResponse((result) => {
    const saves = result.url() === `${getFixtureApi()}/api/snapshots`;
    const posts = result.request().method() === 'POST';
    return saves && posts;
  });
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
  return response;
};

const discardPendingSave = async (page: Page) => {
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Discard pending save…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Discard pending GitHub save?' });
  await expect(dialog).toContainText('may create a duplicate');
  await dialog.getByRole('button', { name: 'Keep pending save', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Retry GitHub save', exact: true }),
  ).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Discard pending save…', exact: true }).click();
  await dialog.getByRole('button', { name: 'Discard pending save', exact: true }).click();
  await expect(dialog).toBeHidden();
};

const editAuthorNode = async (page: Page) => {
  const node = page.locator('.react-flow__node').filter({ hasText: 'Author fixture' });
  await page.getByRole('button', { name: 'fit view', exact: true }).click();
  await node.click();
  await page.getByRole('button', { name: 'adj diagram', exact: true }).click();
  await page.getByLabel('Fill').fill('#ef4444');
  await expect(node).toHaveCSS('background-color', 'rgb(239, 68, 68)');
};

const expectCapturedColor = async (page: Page, link: string) => {
  const file = new URL(link).pathname.split('/').at(-1);
  const [id, revision] = (file ?? '').split('-');
  const api = getFixtureApi();
  const response = await page.request.get(`${api}/api/snapshots/${id}/${revision}`);
  expect(response.ok()).toBe(true);
  const { snapshot } = await response.json();
  expect(snapshot.svg.text).toContain('rgb(239, 68, 68)');
};

const stubAccountSwitch = async (page: Page, list: string) => {
  await stubSnapshotPage(page, list, {
    owner: 'first',
    gistId: 'a',
    title: 'First page graph',
    next: 2,
  });
  await stubSnapshotPage(page, list + '?page=2&account=first', {
    owner: 'first',
    gistId: 'b',
    title: 'Second page graph',
    next: 3,
  });
  await stubSnapshotPage(page, list + '?page=3&account=first', {
    owner: 'second',
    gistId: 'c',
    title: 'New account graph',
    next: 2,
  });
  await stubSnapshotPage(page, list + '?page=2&account=second', {
    owner: 'second',
    gistId: 'd',
    title: 'New account second page',
  });
};

const stubSnapshotPage = (
  page: Page,
  url: string,
  { owner, gistId, title, next }: { owner: string; gistId: string; title: string; next?: number },
) => {
  const revision = 'a'.repeat(40);
  const json = [{ gistId, revision, title, url: `/m2rd/${gistId}-${revision}` }];
  const headers = new Headers({
    'M2rd-Account-Id': owner,
    'Access-Control-Expose-Headers': 'Link, M2rd-Account-Id',
  });
  if (next) headers.set('Link', `</api/snapshots?page=${next}&account=${owner}>; rel="next"`);
  return page.route(url, (route) => route.fulfill({ json, headers: Object.fromEntries(headers) }));
};

const replaceMermaid = async (page: Page, label: string) => {
  const editor = page.locator('.cm-content');
  const source = `flowchart LR\nA[${label}] --> B[End]`;
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(source);
  await expect(page.locator('.react-flow__node').filter({ hasText: label })).toHaveCount(1);
};

const saveLocalEditAndReload = async (page: Page, label: string) => {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.react-flow__node').filter({ hasText: label })).toHaveCount(1);
};

const saveAndSignIn = async (page: Page) => {
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.getByText('Anyone with an unlisted Gist link can view it.')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Save to GitHub' }).click();
  await page.getByRole('button', { name: 'Continue with GitHub' }).click();
  const api = getFixtureApi();
  const response = await page.waitForResponse((response) => {
    const saves = response.url() === api + '/api/snapshots';
    const matchesMethod = response.request().method() === 'POST';
    return saves && matchesMethod;
  });
  const responseText = await response.text();
  expect(response.ok(), responseText).toBe(true);
  const saved = await response.json();
  return String(saved.url);
};

const stubGitHub = (page: Page, id: number) =>
  page.route('https://github.com/login/oauth/authorize?**', (route) => {
    const request = new URL(route.request().url());
    const callback = new URL(request.searchParams.get('redirect_uri') ?? '');
    callback.searchParams.set('code', `fixture-${id}`);
    callback.searchParams.set('state', request.searchParams.get('state') ?? '');
    return route.fulfill({ status: 302, headers: { Location: callback.href } });
  });

const getFixtureApi = () => {
  const port = process.env.M2RD_TEST_API_PORT ?? '54785';
  return `http://127.0.0.1:${port}`;
};
