import { Effect } from 'effect';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/app/graph/constants';
import { encodeSnapshot } from '@/app/graph/snapshot';
import { prepareSave, readSnapshot, saveSnapshot } from '@/packages/server/src/github';
import type { SaveRequest } from '@/packages/server/src/github/types';
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

it('accepts both reconciliation flags when retrying through the authenticated HTTP route', async () => {
  const fixture = await startAuthFixture();
  vi.stubGlobal('fetch', githubFixtureFetch(fetch));
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
  } finally {
    await fixture.close();
  }
});

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
