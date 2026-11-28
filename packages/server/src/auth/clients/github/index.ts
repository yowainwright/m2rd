import { Effect, Option, Semaphore } from 'effect';
import { JSDOM } from 'jsdom';
import { z } from 'zod';
import {
  decodeSnapshot,
  encodeSnapshot,
  formatSnapshotLink,
  getSnapshotFileName,
  parseSnapshotFileName,
  selectSnapshotFile,
  type Snapshot,
  type SnapshotLink,
} from '@/app/graph/snapshot';
import { MAX_SNAPSHOT_BYTES } from '@/app/graph/snapshot/constants';
import type { GitHubAccess, SavedSnapshot, SaveRequest } from './types';
import { createCachedSnapshotReader } from '../utils';

type Gist = z.infer<typeof gistSchema>;

type GistFile = z.infer<typeof file>;
type GistRequest = { signal: AbortSignal; access?: GitHubAccess; reserveRead?: () => void };
type GitHubRequest = GistRequest & { access: GitHubAccess };

export class GistError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly forkId?: string,
    readonly outcomeUnknown = false,
  ) {
    super(message);
    this.name = 'GistError';
  }
}

const base = 'https://api.github.com';
const headerVersion = '2026-03-10';
const marker = 'm2rd snapshot';
const hex = z.string().regex(/^[0-9a-f]+$/i);
const revision = z.string().regex(/^[0-9a-f]{40}$/i);
const file = z.object({
  content: z.string().optional(),
  raw_url: z.url().optional(),
  truncated: z.boolean().optional(),
});
const gistSchema = z.object({
  id: hex,
  public: z.boolean(),
  description: z.string().nullable().optional(),
  owner: z.object({ id: z.number().int().positive() }),
  files: z.record(z.string(), file),
  truncated: z.boolean().optional(),
  history: z.array(z.object({ version: revision })).optional(),
  fork_of: z.object({ id: hex }).nullable().optional(),
});
const discoverySlots = Semaphore.makeUnsafe(4);
const listSchema = z.array(gistSchema);
const schemaWindow = new JSDOM().window;
const maxSaveReads = 32;

export const createPublicSnapshotReader = () => {
  const read = createCachedSnapshotReader(loadRevision, { perHour: 48, perPeer: 12 });
  return (gistId: string, revision: string, peer: string, signal: AbortSignal) => {
    const key = `${gistId}/${revision}`.toLowerCase();
    return read(key, peer, signal);
  };
};

export const readSnapshot = async (link: SnapshotLink, signal: AbortSignal) => {
  const { snapshot, entry, gist } = await readRevision(link, { signal });
  return { snapshot, ownerId: String(gist.owner.id), fileName: entry.fileName };
};

export const discoverSnapshots = async (
  access: GitHubAccess,
  signal: AbortSignal,
  page: number,
  charge: () => void,
) => {
  const lookup = Effect.tryPromise({
    try: () => {
      charge();
      return listSnapshotPage({ access, signal }, page);
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error('Snapshot listing failed.')),
  });
  const result = await Effect.runPromise(discoverySlots.withPermitsIfAvailable(1)(lookup));
  if (Option.isNone(result)) throw new GistError('Snapshot listing is busy. Retry later.', 429);
  return result.value;
};

export const prepareSave = async (
  request: SaveRequest,
  access: GitHubAccess,
  signal: AbortSignal,
) => {
  const github = createSaveRequest(access, signal);
  const snapshot = await Effect.runPromise(decodeSnapshot(request.snapshot, schemaWindow));
  const gists = await paginate('/gists', listSchema, github);
  const reconciled = await reconcile(snapshot, gists, github);
  if (reconciled?.existing) return { existing: reconciled.existing } as const;
  if (reconciled) {
    const { target, forkedFrom } = reconciled;
    return { snapshot, target, forkedFrom } as const;
  }
  if (request.reconcileOnly) throw unknownWrite();
  if (!request.target) return { snapshot } as const;
  const prior = await readRevision(request.target, github);
  const target = await getGist(prior.gist.id, github);
  assertFileList(target);
  const { gistId, revision } = request.target;
  const forkedFrom = { gistId, revision, fileName: prior.entry.fileName };
  if (target.public) return { snapshot, forkedFrom } as const;
  const owned = String(target.owner.id) === access.githubId;
  if (owned) return { snapshot, target, forkedFrom: prior.snapshot.forkedFrom } as const;
  const recoveredFork = await findFork(gists, target.id, request.forkId, github);
  return { snapshot, target: recoveredFork, forkOf: target.id, forkedFrom } as const;
};

export const saveSnapshot = async (
  prepared: Exclude<Awaited<ReturnType<typeof prepareSave>>, { existing: SavedSnapshot }>,
  access: GitHubAccess,
  signal: AbortSignal,
) => {
  const { snapshot, forkOf, forkedFrom } = prepared;
  const github = { access, signal };
  const candidate = prepared.target ?? (forkOf ? await forkGist(forkOf, github) : undefined);
  const file = await buildSnapshotFile(snapshot, candidate, forkedFrom);
  const target = await getUnlistedTarget(candidate, github);
  const needsFreshFile = candidate && !target;
  const { fileName, text } = needsFreshFile
    ? await buildSnapshotFile(snapshot, undefined, forkedFrom)
    : file;
  try {
    const gist = await writeGist(target, fileName, text, github);
    const saved = await verifyWrite(gist, fileName, text, github).catch(() => {
      throw unknownWrite();
    });
    return { ...saved, forkedFrom };
  } catch (cause) {
    if (!forkOf) throw cause;
    const uncertain = cause instanceof GistError && cause.outcomeUnknown;
    throw new GistError(
      'The fork is available. Retry saving the same snapshot.',
      409,
      target?.id,
      uncertain,
    );
  }
};

const createSaveRequest = (access: GitHubAccess, signal: AbortSignal): GitHubRequest => {
  let remaining = maxSaveReads;
  const reserveRead = () => {
    if (remaining === 0) throw new GistError('This save exceeds the GitHub lookup limit.', 429);
    remaining -= 1;
  };
  return { access, signal, reserveRead };
};

const buildSnapshotFile = async (
  snapshot: Snapshot,
  target?: Gist,
  forkedFrom?: Snapshot['forkedFrom'],
) => {
  const ordinal = target ? nextOrdinal(target) : 1;
  const fileName = getSnapshotFileName(ordinal, snapshot.saveId);
  const text = await serialize(snapshot, ordinal, forkedFrom);
  return { fileName, text };
};

const getUnlistedTarget = async (candidate: Gist | undefined, github: GitHubRequest) => {
  if (!candidate) return undefined;
  const current = await getGist(candidate.id, github);
  if (String(current.owner.id) !== github.access.githubId)
    throw new GistError('The save destination belongs to another account.', 403);
  return current.public ? undefined : candidate;
};

const loadRevision = (key: string) => {
  const [gistId, revision] = key.split('/');
  return Effect.tryPromise({
    try: (signal) => readSnapshot({ gistId, revision }, signal),
    catch: (cause) => (cause instanceof Error ? cause : new Error('Snapshot read failed.')),
  });
};

const listSnapshotPage = async (github: GitHubRequest, page: number) => {
  const response = await gistFetch(`/gists?per_page=20&page=${page}`, github);
  const gists = listSchema.parse(await response.json()).filter(isApplicationGist);
  const snapshots = await Effect.runPromise(
    Effect.forEach(
      gists,
      (gist) => Effect.option(Effect.tryPromise(() => readLatest(gist, github))),
      { concurrency: 2 },
    ),
    { signal: github.signal },
  );
  const hasNext = /;\s*rel="next"/.test(response.headers.get('Link') ?? '');
  return { snapshots: snapshots.flatMap(Option.toArray), hasNext };
};

const readLatest = async (listItem: Gist, github: GitHubRequest) => {
  const gist = await getGist(listItem.id, github);
  const head = gist.history?.[0]?.version;
  if (!head) throw new GistError('GitHub did not return the Gist revision.', 502);
  const link = { gistId: gist.id, revision: head };
  const { snapshot } = await readRevision(link, github);
  const url = formatSnapshotLink(link);
  return { ...link, url, title: snapshot.records.workspace.name };
};

const reconcile = async (snapshot: Snapshot, gists: readonly Gist[], github: GitHubRequest) => {
  const owned = gists.filter(
    (gist) =>
      !gist.public && String(gist.owner.id) === github.access.githubId && isApplicationGist(gist),
  );
  const matches = owned.flatMap((gist) => matchFiles(gist, snapshot.saveId));
  if (matches.length === 0) return undefined;
  const gistIds = new Set(matches.map((match) => match.gist.id));
  if (gistIds.size !== 1) throw new GistError('More than one Gist contains this save.', 409);
  const [match] = matches.toSorted((left, right) => right.ordinal - left.ordinal);
  const gist = await getGist(match.gist.id, github);
  if (gist.public) return undefined;
  return reconcileHistory(gist, match.fileName, snapshot, github);
};

const reconcileHistory = async (
  gist: Gist,
  fileName: string,
  snapshot: Snapshot,
  github: GitHubRequest,
) => {
  for await (const version of listHistory(gist.id, github)) {
    const link = { gistId: gist.id, revision: version };
    const found = await matchRevision(link, snapshot.saveId, github);
    if (!found) continue;
    await assertMatchingSnapshot(snapshot, found);
    const existing = {
      ...toSaved(link, found.entry.fileName),
      forkedFrom: found.snapshot.forkedFrom,
    };
    return { existing };
  }
  for (const candidate of matchFiles(gist, snapshot.saveId)) {
    await checkMatchingFile(gist, candidate.fileName, snapshot, github);
  }
  const found = await checkMatchingFile(gist, fileName, snapshot, github);
  return { snapshot, target: gist, forkedFrom: found.snapshot.forkedFrom };
};

const matchFiles = (gist: Gist, saveId: string) => {
  assertFileList(gist);
  return Object.keys(gist.files).flatMap((fileName) => {
    const entry = parseSnapshotFileName(fileName);
    if (!entry) return [];
    const matches = entry.saveId === saveId;
    if (!matches) return [];
    return [{ gist, fileName, ordinal: entry.ordinal }];
  });
};

const checkMatchingFile = async (
  gist: Gist,
  fileName: string,
  snapshot: Snapshot,
  github: GitHubRequest,
) => {
  assertFileList(gist);
  const entry = parseSnapshotFileName(fileName);
  if (!entry) throw new GistError('The previous snapshot filename is invalid.', 409);
  const found = await readSnapshotFile(gist, entry, github);
  await assertMatchingSnapshot(snapshot, found);
  return found;
};

const assertMatchingSnapshot = async (
  snapshot: Snapshot,
  found: { snapshot: Snapshot; text: string },
) => {
  const text = await serialize(snapshot, found.snapshot.ordinal, found.snapshot.forkedFrom);
  if (text !== found.text)
    throw new GistError('This save ID is already associated with different edits.', 409);
};

const matchRevision = async (link: SnapshotLink, saveId: string, github: GitHubRequest) => {
  const gist = await getGistRevision(link, github);
  assertFileList(gist);
  const entries = Object.keys(gist.files).flatMap((name) => parseSnapshotFileName(name) ?? []);
  const ordinal = Math.max(0, ...entries.map((entry) => entry.ordinal));
  const latest = entries.filter((entry) => entry.ordinal === ordinal);
  const matches = latest.length === 1 && latest[0].saveId === saveId;
  if (!matches) return undefined;
  return readSnapshotFile(gist, latest[0], github);
};

const getGistRevision = async (link: SnapshotLink, github: GitHubRequest) => {
  const response = await gistFetch(`/gists/${link.gistId}/${link.revision}`, github);
  return gistSchema.parse(await response.json());
};

async function* listHistory(id: string, github: GitHubRequest) {
  const schema = z.array(z.object({ version: revision }));
  for (let page = 1; ; page += 1) {
    const response = await gistFetch(`/gists/${id}/commits?per_page=100&page=${page}`, github);
    const history = schema.parse(await response.json());
    yield* history.map(({ version }) => version);
    const links = response.headers.get('Link') ?? '';
    if (!/;\s*rel="next"/.test(links)) return;
  }
}

const paginate = async <Value>(
  endpoint: string,
  schema: z.ZodType<Value[]>,
  github: GitHubRequest,
) => {
  const pages = new Map<number, Value[]>();
  for (let page = 1; ; page += 1) {
    const response = await gistFetch(`${endpoint}?per_page=100&page=${page}`, github);
    pages.set(page, schema.parse(await response.json()));
    const links = response.headers.get('Link') ?? '';
    if (!/;\s*rel="next"/.test(links)) return Array.from(pages.values()).flat();
  }
};

const findFork = async (
  gists: Gist[],
  original: string,
  preferred: string | undefined,
  github: GitHubRequest,
) => {
  const candidates = preferred ? [await getGist(preferred, github)] : gists;
  const owned = candidates.filter(
    (gist) => String(gist.owner.id) === github.access.githubId && isApplicationGist(gist),
  );
  for (const candidate of owned) {
    const detail = candidate.fork_of ? candidate : await getGist(candidate.id, github);
    if (detail.fork_of?.id === original) return detail;
  }
  if (preferred) throw new GistError('The selected fork does not belong to this account.', 403);
  return undefined;
};

const forkGist = async (id: string, github: GitHubRequest) => {
  const response = await gistFetch(`/gists/${id}/forks`, github, { method: 'POST' });
  const fork = gistSchema.parse(await response.json());
  if (String(fork.owner.id) !== github.access.githubId)
    throw new GistError('GitHub returned a foreign fork.', 403);
  return fork;
};

const getGist = async (id: string, github: GistRequest) => {
  const response = await gistFetch(`/gists/${hex.parse(id)}`, github);
  return gistSchema.parse(await response.json());
};

const nextOrdinal = (gist: Gist) => {
  assertFileList(gist);
  const entries = Object.keys(gist.files).flatMap((name) => parseSnapshotFileName(name) ?? []);
  return Math.max(0, ...entries.map((entry) => entry.ordinal)) + 1;
};

const serialize = (snapshot: Snapshot, ordinal: number, forkedFrom?: Snapshot['forkedFrom']) => {
  const { records, svg, saveId } = snapshot;
  return Effect.runPromise(
    encodeSnapshot({ records, svg: svg.text, saveId, ordinal, forkedFrom }, schemaWindow),
  );
};

const writeGist = async (
  target: Gist | undefined,
  fileName: string,
  text: string,
  github: GitHubRequest,
) => {
  const files = { [fileName]: { content: text } };
  const alreadyExists = target && Object.hasOwn(target.files, fileName);
  if (alreadyExists) throw new GistError('The snapshot file already exists.', 409);
  const body = JSON.stringify(target ? { files } : { files, public: false, description: marker });
  const path = target ? `/gists/${target.id}` : '/gists';
  try {
    const response = await gistFetch(path, github, {
      method: target ? 'PATCH' : 'POST',
      body,
    });
    return gistSchema.parse(await response.json());
  } catch (cause) {
    if (cause instanceof GistError) throw cause;
    throw unknownWrite();
  }
};

const verifyWrite = async (gist: Gist, fileName: string, text: string, github: GitHubRequest) => {
  if (gist.public) throw new GistError('GitHub returned a public save destination.', 409);
  const version = gist.history?.[0]?.version;
  if (!version) throw new GistError('GitHub did not confirm the save revision.', 409);
  const link = { gistId: gist.id, revision: version };
  const saved = await readRevision(link, github);
  const fileMatches = saved.text === text && saved.entry.fileName === fileName;
  const ownerMatches = String(saved.gist.owner.id) === github.access.githubId;
  const verified = fileMatches && ownerMatches && !saved.gist.public;
  if (!verified) throw new GistError('The saved bytes did not match the requested snapshot.', 409);
  return toSaved(link, fileName);
};

const readRevision = async (link: SnapshotLink, github: GistRequest) => {
  const path = `/gists/${hex.parse(link.gistId)}/${revision.parse(link.revision)}`;
  const response = await gistFetch(path, github);
  const gist = gistSchema.parse(await response.json());
  assertFileList(gist);
  const fileNames = Object.keys(gist.files);
  const entry = selectSnapshotFile(fileNames);
  return readSnapshotFile(gist, entry, github);
};

const readSnapshotFile = async (
  gist: Gist,
  entry: NonNullable<ReturnType<typeof parseSnapshotFileName>>,
  github: GistRequest,
) => {
  if (!Object.hasOwn(gist.files, entry.fileName))
    throw new GistError('The previous snapshot file is unavailable.', 409);
  const text = await readFile(gist.files[entry.fileName], gist.id, entry.fileName, github);
  const snapshot = await Effect.runPromise(decodeSnapshot(text, schemaWindow));
  const matched = snapshot.saveId === entry.saveId && snapshot.ordinal === entry.ordinal;
  if (!matched) throw new GistError('The Gist file and snapshot identifiers differ.', 422);
  return { gist, entry, snapshot, text };
};

const readFile = async (
  file: GistFile,
  gistId: string,
  fileName: string,
  { signal, reserveRead }: GistRequest,
) => {
  const complete = !file.truncated && file.content !== undefined;
  if (complete) return file.content ?? '';
  if (!file.raw_url) throw new GistError('GitHub omitted the frozen snapshot file.', 502);
  const url = new URL(file.raw_url);
  const expectedPath = new RegExp(
    `^/[^/]+/${gistId}/raw/[0-9a-f]{40}/${fileName.replace('.', '\\.')}$`,
    'i',
  );
  const trustedUrl =
    url.origin === 'https://gist.githubusercontent.com' && expectedPath.test(url.pathname);
  const hasOtherParts = url.username || url.password || url.search || url.hash;
  const invalid = !trustedUrl || hasOtherParts;
  if (invalid) throw new GistError('GitHub returned an invalid snapshot URL.', 502);
  reserveRead?.();
  const response = await fetch(url, { redirect: 'error', signal });
  if (!response.ok) throw new GistError('The frozen snapshot could not be downloaded.', 404);
  return readBoundedText(response);
};

const readBoundedText = async (response: Response) => {
  if (!response.body) throw new GistError('The snapshot file is empty.', 502);
  const bytes = new Set<Uint8Array>();
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.byteLength;
    if (length > MAX_SNAPSHOT_BYTES)
      throw new GistError('The snapshot exceeds the size limit.', 413);
    bytes.add(chunk);
  }
  return Buffer.concat(Array.from(bytes), length).toString('utf8');
};

const toSaved = (link: SnapshotLink, fileName: string): SavedSnapshot => {
  const url = formatSnapshotLink(link);
  return { ...link, fileName, url };
};

const assertFileList = (gist: Gist) => {
  if (gist.truncated) throw new GistError('GitHub truncated the snapshot file list.', 409);
};

const isApplicationGist = (gist: Gist) => {
  const names = Object.keys(gist.files);
  const hasSnapshot = names.some((name) => parseSnapshotFileName(name) !== null);
  const hasMarker = gist.description === marker;
  return hasSnapshot || hasMarker;
};

const gistFetch = async (
  path: string,
  { access, signal, reserveRead }: GistRequest,
  init?: RequestInit,
) => {
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': headerVersion,
  });
  if (access) headers.set('Authorization', `Bearer ${access.token}`);
  if (init?.body) headers.set('Content-Type', 'application/json');
  reserveRead?.();
  const response = await fetch(base + path, { ...init, headers, signal, redirect: 'error' });
  if (response.ok) return response;
  const limited = response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0';
  if (limited) throw new GistError('GitHub rate limit reached. Retry later.', 429);
  if (response.status === 404) throw new GistError('The Gist or revision is unavailable.', 404);
  const uncertainWrite = init?.method && response.status >= 500;
  if (uncertainWrite) throw unknownWrite();
  throw new GistError('GitHub declined the snapshot operation.', 502);
};

const unknownWrite = () =>
  new GistError(
    'GitHub may have saved this snapshot. Retry to check the same save.',
    409,
    undefined,
    true,
  );
