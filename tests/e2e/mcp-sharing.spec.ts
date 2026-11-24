import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import {
  githubFixtureFetch,
  issueFixtureToken,
  signInFixture,
  startAuthFixture,
} from '../integration/auth/utils';
import { githubGistsFixture } from '../integration/github/utils';

test('opens the exact snapshot created by an SDK tool call in a guest browser', async ({
  page,
}) => {
  const fixture = await startAuthFixture();
  const networkFetch = globalThis.fetch;
  globalThis.fetch = githubGistsFixture(githubFixtureFetch(networkFetch, 903));
  const client = new Client(
    { name: 'm2rd browser fixture', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  try {
    const cookie = await signInFixture(fixture);
    const { access_token: token } = await issueFixtureToken(fixture, cookie);
    const url = new URL(fixture.origin + '/mcp');
    const headers = { Authorization: `Bearer ${token}` };
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers } }));
    const source = 'flowchart LR\nA[SDK snapshot] --> B[Guest opened]';
    const created = await client.callTool({ name: 'create_graph', arguments: { source } });
    expect(created.isError).not.toBe(true);
    const link = Reflect.get(created.structuredContent ?? {}, 'url');
    const address = new URL(link);
    await page.route('**/api/snapshots/*/*', async (route) => {
      const request = new URL(route.request().url());
      const proxied = new URL(request.pathname, fixture.origin);
      const response = await route.fetch({ url: proxied.href });
      await route.fulfill({ response });
    });
    await page.goto(address.pathname);
    await expect(page.locator('.react-flow__node').filter({ hasText: 'SDK snapshot' })).toHaveCount(
      1,
    );
  } finally {
    await client.close();
    globalThis.fetch = networkFetch;
    await fixture.close();
  }
});
