import { Effect } from 'effect';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/app/graph/constants';
import { encodeSnapshot } from '@/app/graph/snapshot';
import {
  createPublicSnapshotReader,
  discoverSnapshots,
  prepareSave,
  readSnapshot,
  saveSnapshot,
} from '@/packages/server/src/auth/clients/github';
import type { SaveRequest } from '@/packages/server/src/auth/clients/github/types';
import { githubFixtureFetch, signInFixture, startAuthFixture } from '../auth/utils';
import { githubGistsFixture } from './utils';

const { window } = new JSDOM();
const signal = new AbortController().signal;
const author = { githubId: '81', token: 'fixture-github-token-81' };
const recipient = { githubId: '82', token: 'fixture-github-token-82' };
const date = '2026-11-17T00:00:00.000Z';

beforeEach(() => {
  vi.stubGlobal('fetch', githubGistsFixture(fetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('shares a cached frozen revision and charges failed lookups to the requesting peer', async () => {
  const { gistId, revision } = await save({ snapshot: await snapshot('Cached graph') }, author);
  const upstream = vi.fn(fetch);
  vi.stubGlobal('fetch', upstream);
  const read = createPublicSnapshotReader();
  const firstRead = read(gistId, revision, 'reader', signal);
  const secondRead = read(gistId.toUpperCase(), revision, 'reader', signal);
  const first = await firstRead;
  await expect(secondRead).resolves.toEqual(first);
  expect(upstream).toHaveBeenCalledTimes(1);
  for (let index = 1; index < 12; index += 1) {
    await expect(read('bad', revision, 'reader', signal)).rejects.toMatchObject({ status: 404 });
  }
  await expect(read('bad', revision, 'reader', signal)).rejects.toMatchObject({ status: 429 });
  await expect(read(gistId, revision, 'reader', signal)).resolves.toEqual(first);
  expect(upstream).toHaveBeenCalledTimes(12);
  await expect(read('bad', revision, 'another reader', signal)).rejects.toMatchObject({
    status: 404,
  });
});

it('shares one rolling budget across public readers', async () => {
  const read = createPublicSnapshotReader();
  const revision = 'a'.repeat(40);
  const upstream = vi.fn(() => Promise.resolve(new Response(null, { status: 404 })));
  vi.stubGlobal('fetch', upstream);
  for (let index = 0; index < 48; index += 1) {
    await expect(read('ab', revision, String(index), signal)).rejects.toMatchObject({
      status: 404,
    });
  }
  await expect(read('ab', revision, 'last', signal)).rejects.toMatchObject({ status: 429 });
  expect(upstream).toHaveBeenCalledTimes(48);
});

it('stops serving a deleted revision after the five-minute cache lifetime', async () => {
  const { gistId, revision } = await save({ snapshot: await snapshot('Deleted graph') }, author);
  const read = createPublicSnapshotReader();
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    const cached = await read(gistId, revision, 'first reader', signal);
    const deleted = vi.fn(() => Promise.resolve(new Response(null, { status: 404 })));
    vi.stubGlobal('fetch', deleted);
    vi.setSystemTime(Date.now() + 299_999);
    await expect(read(gistId, revision, 'new reader', signal)).resolves.toEqual(cached);
    expect(deleted).not.toHaveBeenCalled();
    vi.setSystemTime(Date.now() + 2);
    await expect(read(gistId, revision, 'new reader', signal)).rejects.toMatchObject({
      status: 404,
    });
    expect(deleted).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

it('fetches only the requested discovery page, including pages without matching snapshots', async () => {
  const upstream = vi.fn(() =>
    Promise.resolve(Response.json([], { headers: { Link: '<page>; rel="next"' } })),
  );
  vi.stubGlobal('fetch', upstream);
  await expect(discoverSnapshots(author, signal, 2, vi.fn())).resolves.toEqual({
    snapshots: [],
    hasNext: true,
  });
  expect(upstream).toHaveBeenCalledTimes(1);
  expect(upstream).toHaveBeenCalledWith(
    'https://api.github.com/gists?per_page=20&page=2',
    expect.anything(),
  );
});

it('bounds concurrent discovery pages and detail reads across accounts', async () => {
  const { release, full, peak } = holdDiscoveryReads();
  const charge = vi.fn();
  const waitingAccountCharge = vi.fn();
  const listings = Promise.allSettled(
    ['1', '2', '3', '4'].map((githubId) =>
      discoverSnapshots({ ...author, githubId }, signal, 1, charge),
    ),
  );
  try {
    await full.promise;
    await expect(
      discoverSnapshots(recipient, signal, 1, waitingAccountCharge),
    ).rejects.toMatchObject({ status: 429 });
    expect(waitingAccountCharge).not.toHaveBeenCalled();
    expect(charge).toHaveBeenCalledTimes(4);
  } finally {
    release.resolve();
    await listings;
  }
  expect(peak()).toBe(8);
  await expect(discoverSnapshots(recipient, signal, 1, waitingAccountCharge)).resolves.toEqual({
    snapshots: [],
    hasNext: false,
  });
  expect(waitingAccountCharge).toHaveBeenCalledOnce();
});

it('restarts discovery at page one when a continuation belongs to a different session account', async () => {
  const fixture = await startAuthFixture();
  const upstream = vi.fn(githubFixtureFetch(fetch));
  vi.stubGlobal('fetch', upstream);
  try {
    const cookie = await signInFixture(fixture);
    const headers = { cookie, Origin: fixture.frontendOrigin };
    const url = fixture.origin + '/api/snapshots?page=2&account=';
    const restarted = await fetch(url + 'previous-account', { headers });
    expect(restarted.status).toBe(200);
    const session = await fixture.auth.api.getSession({ headers: new Headers(headers) });
    const owner = session!.user.id;
    expect(restarted.headers.get('M2rd-Account-Id')).toBe(owner);
    expect(restarted.headers.get('Access-Control-Expose-Headers')).toContain('M2rd-Account-Id');
    expect(upstream).toHaveBeenCalledWith(
      'https://api.github.com/gists?per_page=20&page=1',
      expect.anything(),
    );
    expect(upstream).not.toHaveBeenCalledWith(
      'https://api.github.com/gists?per_page=20&page=2',
      expect.anything(),
    );
    const continued = await fetch(url + encodeURIComponent(owner), { headers });
    expect(continued.status).toBe(200);
    expect(upstream).toHaveBeenCalledWith(
      'https://api.github.com/gists?per_page=20&page=2',
      expect.anything(),
    );
  } finally {
    await fixture.close();
  }
});

it('appends a new owner snapshot, reconciles a retry, and keeps both frozen revisions readable', async () => {
  const first = await save({ snapshot: await snapshot('Original') }, author);
  const edited = await snapshot('Edited');
  const second = await save({ snapshot: edited, target: first }, author);
  expect(second.gistId).toBe(first.gistId);
  expect(second.revision).not.toBe(first.revision);
  expect(second.fileName).not.toBe(first.fileName);
  const original = await readSnapshot(first, signal);
  expect(original.snapshot.records.workspace.name).toBe('Original');
  const current = await readSnapshot(second, signal);
  expect(current.snapshot.records.workspace.name).toBe('Edited');
  await expect(save({ snapshot: edited, target: first }, author)).resolves.toEqual(second);
});

it('forks the exact original attribution into the recipient account and appends later edits there', async () => {
  const original = await save({ snapshot: await snapshot('Original') }, author);
  const fork = await save(
    { snapshot: await snapshot('Recipient edit'), target: original },
    recipient,
  );
  expect(fork.gistId).not.toBe(original.gistId);
  const loaded = await readSnapshot(fork, signal);
  expect(loaded.ownerId).toBe(recipient.githubId);
  expect(loaded.snapshot.records.workspace.name).toBe('Recipient edit');
  const { gistId, revision, fileName } = original;
  expect(loaded.snapshot.forkedFrom).toEqual({ gistId, revision, fileName });
  const newer = await save({ snapshot: await snapshot('Next edit'), target: fork }, recipient);
  expect(newer.gistId).toBe(fork.gistId);
  expect((await readSnapshot(original, signal)).snapshot.records.workspace.name).toBe('Original');
});

it.each([author, recipient])(
  'saves edits from a public source in a fresh unlisted Gist for $githubId',
  async (account) => {
    const original = await save({ snapshot: await snapshot('Public source') }, author);
    const upstream = markGistPublic(original.gistId);
    const request = { snapshot: await snapshot('Unlisted edit'), target: original };
    const edited = await save(request, account);
    expect(edited.gistId).not.toBe(original.gistId);
    const { gistId, revision, fileName } = original;
    expect(edited.forkedFrom).toEqual({ gistId, revision, fileName });
    await expect(save({ ...request, reconcileOnly: true }, account)).resolves.toEqual(edited);
    const writes = upstream.mock.calls.filter(([, init]) => init?.method);
    expect(writes).toHaveLength(1);
    const [[url, init]] = writes;
    expect(url).toBe('https://api.github.com/gists');
    expect(JSON.parse(String(init?.body)).public).toBe(false);
  },
);

it('rechecks visibility before writing a prepared edit', async () => {
  const target = await save({ snapshot: await snapshot('Original') }, author);
  const prepared = await prepareSave(
    { snapshot: await snapshot('Private edit'), target },
    author,
    signal,
  );
  if (prepared.existing) throw new Error('Expected an unsaved edit.');
  markGistPublic(target.gistId);
  const result = await saveSnapshot(prepared, author, signal);
  expect(result.gistId).not.toBe(target.gistId);
});

it('declines the write when GitHub omits the destination visibility', async () => {
  const target = await save({ snapshot: await snapshot('Original') }, author);
  const prepared = await prepareSave(
    { snapshot: await snapshot('Edited'), target },
    author,
    signal,
  );
  if (prepared.existing) throw new Error('Expected an unsaved edit.');
  const upstream = vi.fn(() =>
    Promise.resolve(Response.json({ id: target.gistId, owner: { id: 81 }, files: {} })),
  );
  vi.stubGlobal('fetch', upstream);
  await expect(saveSnapshot(prepared, author, signal)).rejects.toThrow();
  expect(upstream).toHaveBeenCalledOnce();
  expect(upstream).toHaveBeenCalledWith(
    `https://api.github.com/gists/${target.gistId}`,
    expect.not.objectContaining({ method: 'PATCH' }),
  );
});

it('stops preparation when a GitHub listing exceeds the lookup budget', async () => {
  const upstream = vi.fn(() =>
    Promise.resolve(Response.json([], { headers: { Link: '<page>; rel="next"' } })),
  );
  vi.stubGlobal('fetch', upstream);
  const request = { snapshot: await snapshot('New diagram') };
  await expect(prepareSave(request, author, signal)).rejects.toMatchObject({ status: 429 });
  expect(upstream).toHaveBeenCalledTimes(32);
});

it('recovers a recent save from long history without reading older history pages', async () => {
  const first = await save({ snapshot: await snapshot('Original') }, author);
  for (let index = 0; index < 30; index += 1) {
    await save({ snapshot: await snapshot(`Edit ${index}`), target: first }, author);
  }
  const text = await snapshot('Latest edit');
  const saved = await save({ snapshot: text, target: first }, author);
  const upstream = vi.fn(fetch);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await upstream(input, init);
    const url = new URL(String(input));
    if (!url.pathname.endsWith('/commits')) return response;
    const history = await response.json();
    const headers = { Link: '<older-page>; rel="next"' };
    return Response.json(history.slice(0, 20), { headers });
  });
  const request = { snapshot: text, target: first, reconcileOnly: true };
  await expect(save(request, author)).resolves.toEqual(saved);
  expect(upstream).toHaveBeenCalledTimes(4);
  expect(upstream).not.toHaveBeenCalledWith(expect.stringContaining('page=2'), expect.anything());
});

it('accepts both reconciliation flags when retrying through the authenticated HTTP route', async () => {
  const fixture = await startAuthFixture();
  const upstream = vi.fn(fetch);
  vi.stubGlobal('fetch', githubFixtureFetch(upstream));
  try {
    const cookie = await signInFixture(fixture);
    const headers = { cookie, Origin: fixture.frontendOrigin, 'Content-Type': 'application/json' };
    const text = await snapshot('HTTP retry');
    const post = (reconcileOnly?: boolean) =>
      fetch(fixture.origin + '/api/snapshots', {
        method: 'POST',
        headers,
        body: JSON.stringify({ snapshot: text, reconcileOnly }),
      });
    const initial = await post();
    expect(initial.status).toBe(200);
    const saved = await initial.json();
    for (const flag of [false, true]) {
      const retry = await post(flag);
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual(saved);
    }
    expect(
      fixture.database.prepare("SELECT count FROM usage WHERE window_type = 'day'").get(),
    ).toEqual({ count: 3 });
    fixture.database.prepare("UPDATE usage SET count = 100 WHERE window_type = 'day'").run();
    upstream.mockClear();
    expect((await post(true)).status).toBe(429);
    expect(upstream).not.toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/api\.github\.com\/gists/),
      expect.anything(),
    );
  } finally {
    await fixture.close();
  }
});

const markGistPublic = (id: string, fallback = fetch) => {
  const upstream = vi.fn<typeof fetch>(async (input, init) => {
    const response = await fallback(input, init);
    if (init?.method) return response;
    if (String(input) !== `https://api.github.com/gists/${id}`) return response;
    const gist = await response.json();
    return Response.json({ ...gist, public: true });
  });
  vi.stubGlobal('fetch', upstream);
  return upstream;
};

it('recovers the same save after an external writer creates an ordinal collision', async () => {
  const original = await save({ snapshot: await snapshot('Original') }, author);
  const edited = await snapshot('Our edit');
  const request = { snapshot: edited, target: original };
  const prepared = await prepareSave(request, author, signal);
  if (prepared.existing) throw new Error('The fixture save unexpectedly exists.');
  const external = await save(
    { snapshot: await snapshot('External edit'), target: original },
    author,
  );
  await expect(saveSnapshot(prepared, author, signal)).rejects.toMatchObject({
    outcomeUnknown: true,
  });
  const recovered = await save({ ...request, reconcileOnly: true }, author);
  expect(recovered.gistId).toBe(original.gistId);
  expect(recovered.fileName).toContain('0000000003');
  expect((await readSnapshot(recovered, signal)).snapshot.records.workspace.name).toBe('Our edit');
  expect((await readSnapshot(external, signal)).snapshot.records.workspace.name).toBe(
    'External edit',
  );
  expect((await readSnapshot(original, signal)).snapshot.records.workspace.name).toBe('Original');
  await expect(save({ ...request, reconcileOnly: true }, author)).resolves.toEqual(recovered);
  const next = await save({ snapshot: await snapshot('Next edit'), target: recovered }, author);
  expect(next.fileName).toContain('0000000004');
});

const holdDiscoveryReads = () => {
  const release = Promise.withResolvers<void>();
  const full = Promise.withResolvers<void>();
  const ids = ['a', 'b', 'c'];
  const page = ids.map((id) => ({
    id,
    public: false,
    owner: { id: 81 },
    files: {},
    description: 'm2rd snapshot',
  }));
  let active = 0;
  let peak = 0;
  vi.stubGlobal('fetch', async (input: string) => {
    if (new URL(input).pathname === '/gists') return Response.json(page);
    active += 1;
    peak = Math.max(peak, active);
    if (active === 8) full.resolve();
    await release.promise;
    active -= 1;
    return new Response(null, { status: 404 });
  });
  return { release, full, peak: () => peak };
};

const save = async (request: SaveRequest, access: typeof author) => {
  const prepared = await prepareSave(request, access, signal);
  return prepared.existing ?? saveSnapshot(prepared, access, signal);
};

const snapshot = (name: string) => {
  const records = {
    input: {
      id: 'input',
      workspaceId: 'workspace',
      version: 1,
      format: 'mermaid' as const,
      source: 'flowchart LR\nA --> B',
      updatedAt: date,
    },
    workspace: {
      id: 'workspace',
      activeInputId: 'input',
      activeTranslationId: 'translation',
      name,
      updatedAt: date,
    },
    translation: {
      id: 'translation',
      inputId: 'input',
      error: null,
      settings: DEFAULT_SETTINGS,
      view: {},
      updatedAt: date,
      elements: { edges: [], nodes: [] },
    },
  };
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Fixture graph</text></svg>';
  const saveId = crypto.randomUUID();
  return Effect.runPromise(encodeSnapshot({ records, svg, saveId, ordinal: 1 }, window));
};
