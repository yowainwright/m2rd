import { execFileSync } from 'node:child_process';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import project from '@/package.json' with { type: 'json' };
import {
  githubFixtureFetch,
  issueFixtureToken,
  postFixtureToken,
  signInFixture,
  startAuthFixture,
} from '../auth/utils';
import { githubGistsFixture } from '../github/utils';

let fixture: Awaited<ReturnType<typeof startAuthFixture>>;

beforeAll(async () => {
  const env = { ...process.env, npm_config_manage_package_manager_versions: 'false' };
  execFileSync('pnpm', ['run', 'server:build'], { env, stdio: 'pipe' });
  fixture = await startAuthFixture();
  vi.stubGlobal('fetch', githubGistsFixture(githubFixtureFetch(fetch)));
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await fixture?.close();
});

it('discovers exactly two tools, calls them, and revokes the same grant at sign-out', async () => {
  const cookie = await signInFixture(fixture);
  const tokens = await issueFixtureToken(fixture, cookie);
  const client = await connectClient(tokens.access_token);
  try {
    expect(client.getServerVersion()).toMatchObject({ name: 'm2rd-mcp', version: project.version });
    await expectTools(client);
    await signOut(cookie);
    await expect(connectClient(tokens.access_token)).rejects.toThrow();
    await signInFixture(fixture);
    await expect(connectClient(tokens.access_token)).rejects.toThrow();
    const refresh = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: tokens.clientId,
    });
    const response = await postFixtureToken(fixture.origin, refresh);
    expect(response.status).toBe(400);
  } finally {
    await client.close();
  }
}, 30_000);

const expectTools = async (client: Client) => {
  const { tools } = await client.listTools();
  expect(tools.map(({ name }) => name).sort()).toEqual(['create_graph', 'render_text']);
  const source = 'flowchart LR\nA[Fixture hello] --> B[Fixture world]';
  const text = await client.callTool({ name: 'render_text', arguments: { source, ascii: true } });
  expect(text.isError).not.toBe(true);
  expect(text.content).toEqual([{ type: 'text', text: expect.stringContaining('Fixture hello') }]);
  const graph = await client.callTool({
    name: 'create_graph',
    arguments: { source, title: 'Shared fixture' },
  });
  expect(graph.isError).not.toBe(true);
  const url = Reflect.get(graph.structuredContent ?? {}, 'url');
  expect(url).toMatch(/^https:\/\/jeffry\.in\/m2rd\/[a-f0-9]+-[a-f0-9]{40}$/);
  const location = new URL(String(url)).pathname.split('/').at(-1) ?? '';
  const [id, revision] = location.split('-');
  const restored = await fetch(fixture.origin + `/api/snapshots/${id}/${revision}`);
  expect(restored.status).toBe(200);
  const data = await restored.json();
  expect(data.snapshot.records.input.source).toBe(source);
};

const connectClient = async (token: string) => {
  const client = new Client(
    { name: 'm2rd integration', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  const resource = new URL(fixture.origin + '/mcp');
  const transport = new StreamableHTTPClientTransport(resource, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
};

const signOut = async (cookie: string) => {
  const response = await fetch(fixture.origin + '/api/auth/sign-out', {
    method: 'POST',
    headers: { cookie, Origin: fixture.frontendOrigin },
  });
  expect(response.status).toBe(200);
};
