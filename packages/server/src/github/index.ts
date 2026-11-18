import { Effect } from 'effect';
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

type Gist = z.infer<typeof gistSchema>;

type GistFile = z.infer<typeof file>;
type GitHubRequest = { access: GitHubAccess; signal: AbortSignal };

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
  description: z.string().nullable().optional(),
  owner: z.object({ id: z.number().int().positive() }),
  files: z.record(z.string(), file),
  truncated: z.boolean().optional(),
  history: z.array(z.object({ version: revision })).optional(),
  fork_of: z.object({ id: hex }).nullable().optional(),
});
const listSchema = z.array(gistSchema);
const schemaWindow = new JSDOM().window;

export const readSnapshot = async (link: SnapshotLink, signal: AbortSignal) => {
  const { snapshot, entry, gist } = await readRevision(link, signal);
  return { snapshot, ownerId: String(gist.owner.id), fileName: entry.fileName };
};

export const discoverSnapshots = async (access: GitHubAccess, signal: AbortSignal) => {
  const gists = await listGists(access, signal);
  const marked = gists.filter(isApplicationGist);
  const results = await Promise.allSettled(marked.map((gist) => readLatest(gist, access, signal)));
  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
};

export const prepareSave = async (
  request: SaveRequest,
  access: GitHubAccess,
  signal: AbortSignal,
) => {
  const snapshot = await Effect.runPromise(decodeSnapshot(request.snapshot, schemaWindow));
  const gists = await listGists(access, signal);
  const reconciled = await reconcile(snapshot, gists, access, signal);
  if (reconciled?.existing) return { existing: reconciled.existing } as const;
  if (reconciled) {
    const { target, forkedFrom } = reconciled;
    return { snapshot, target, forkedFrom } as const;
  }
  if (request.reconcileOnly) throw unknownWrite();
  if (!request.target) return { snapshot } as const;
  const prior = await readRevision(request.target, signal, access);
  const target = await getGist(prior.gist.id, signal, access);
  assertFileList(target);
  const owned = String(target.owner.id) === access.githubId;
  if (owned) return { snapshot, target, forkedFrom: prior.snapshot.forkedFrom } as const;
  const { gistId, revision } = request.target;
  const forkedFrom = { gistId, revision, fileName: prior.entry.fileName };
  const recoveredFork = await findFork(gists, target.id, request.forkId, { access, signal });
  return { snapshot, target: recoveredFork, forkOf: target.id, forkedFrom } as const;
};

export const saveSnapshot = async (
  prepared: Exclude<Awaited<ReturnType<typeof prepareSave>>, { existing: SavedSnapshot }>,
  access: GitHubAccess,
  signal: AbortSignal,
) => {
  const { snapshot, forkOf, forkedFrom } = prepared;
  const target = prepared.target ?? (forkOf ? await forkGist(forkOf, access, signal) : undefined);
  const ordinal = target ? nextOrdinal(target) : 1;
  const fileName = getSnapshotFileName(ordinal, snapshot.saveId);
  const text = await serialize(snapshot, ordinal, forkedFrom);
  try {
    const github = { access, signal };
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

const readLatest = async (listItem: Gist, access: GitHubAccess, signal: AbortSignal) => {
  const gist = await getGist(listItem.id, signal, access);
  const head = gist.history?.[0]?.version;
  if (!head) throw new GistError('GitHub did not return the Gist revision.', 502);
  const link = { gistId: gist.id, revision: head };
  const { snapshot } = await readRevision(link, signal, access);
  const url = formatSnapshotLink(link);
  return { ...link, url, title: snapshot.records.workspace.name };
};

const reconcile = async (
  snapshot: Snapshot,
  gists: readonly Gist[],
  access: GitHubAccess,
  signal: AbortSignal,
) => {
  const owned = gists.filter(
    (gist) => String(gist.owner.id) === access.githubId && isApplicationGist(gist),
  );
  const matches = owned.flatMap((gist) => matchFiles(gist, snapshot.saveId));
  if (matches.length === 0) return undefined;
  const gistIds = new Set(matches.map((match) => match.gist.id));
  if (gistIds.size !== 1) throw new GistError('More than one Gist contains this save.', 409);
  const [match] = matches.toSorted((left, right) => right.ordinal - left.ordinal);
  const gist = await getGist(match.gist.id, signal, access);
  return reconcileHistory(gist, match.fileName, snapshot, { access, signal });
};

const reconcileHistory = async (
  gist: Gist,
  fileName: string,
  snapshot: Snapshot,
  { access, signal }: GitHubRequest,
) => {
  const commits = await listHistory(gist.id, access, signal);
  const earliest = commits.toReversed();
  for (const version of earliest) {
    const link = { gistId: gist.id, revision: version };
    const found = await matchRevision(link, snapshot.saveId, access, signal);
    if (!found) continue;
    await assertMatchingSnapshot(snapshot, found);
    const existing = {
      ...toSaved(link, found.entry.fileName),
      forkedFrom: found.snapshot.forkedFrom,
    };
    return { existing };
  }
  for (const candidate of matchFiles(gist, snapshot.saveId)) {
    await checkMatchingFile(gist, candidate.fileName, snapshot, signal);
  }
  const found = await checkMatchingFile(gist, fileName, snapshot, signal);
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
  signal: AbortSignal,
) => {
  assertFileList(gist);
  const entry = parseSnapshotFileName(fileName);
  if (!entry) throw new GistError('The previous snapshot filename is invalid.', 409);
  const found = await readSnapshotFile(gist, entry, signal);
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

const matchRevision = async (
  link: SnapshotLink,
  saveId: string,
  access: GitHubAccess,
  signal: AbortSignal,
) => {
  const gist = await getGistRevision(link, access, signal);
  assertFileList(gist);
  const entries = Object.keys(gist.files).flatMap((name) => parseSnapshotFileName(name) ?? []);
  const ordinal = Math.max(0, ...entries.map((entry) => entry.ordinal));
  const latest = entries.filter((entry) => entry.ordinal === ordinal);
  const matches = latest.length === 1 && latest[0].saveId === saveId;
  if (!matches) return undefined;
  return readSnapshotFile(gist, latest[0], signal);
};

const getGistRevision = async (link: SnapshotLink, access: GitHubAccess, signal: AbortSignal) => {
  const response = await gistFetch(`/gists/${link.gistId}/${link.revision}`, signal, access);
  return gistSchema.parse(await response.json());
};

const listGists = (access: GitHubAccess, signal: AbortSignal) =>
  paginate('/gists', listSchema, access, signal);

const listHistory = async (id: string, access: GitHubAccess, signal: AbortSignal) => {
  const schema = z.array(z.object({ version: revision }));
  const history = await paginate(`/gists/${id}/commits`, schema, access, signal);
  return history.map(({ version }) => version);
};

const paginate = async <Value>(
  endpoint: string,
  schema: z.ZodType<Value[]>,
  access: GitHubAccess,
  signal: AbortSignal,
) => {
  const pages = new Map<number, Value[]>();
  for (let page = 1; ; page += 1) {
    const response = await gistFetch(`${endpoint}?per_page=100&page=${page}`, signal, access);
    pages.set(page, schema.parse(await response.json()));
    const links = response.headers.get('Link') ?? '';
    if (!/;\s*rel="next"/.test(links)) return Array.from(pages.values()).flat();
  }
};

const findFork = async (
  gists: Gist[],
  original: string,
  preferred: string | undefined,
  { access, signal }: GitHubRequest,
) => {
  const candidates = preferred ? [await getGist(preferred, signal, access)] : gists;
  const owned = candidates.filter(
    (gist) => String(gist.owner.id) === access.githubId && isApplicationGist(gist),
  );
  for (const candidate of owned) {
    const detail = candidate.fork_of ? candidate : await getGist(candidate.id, signal, access);
    if (detail.fork_of?.id === original) return detail;
  }
  if (preferred) throw new GistError('The selected fork does not belong to this account.', 403);
  return undefined;
};

const forkGist = async (id: string, access: GitHubAccess, signal: AbortSignal) => {
  const response = await gistFetch(`/gists/${id}/forks`, signal, access, { method: 'POST' });
  const fork = gistSchema.parse(await response.json());
  if (String(fork.owner.id) !== access.githubId)
    throw new GistError('GitHub returned a foreign fork.', 403);
  return fork;
};

const getGist = async (id: string, signal: AbortSignal, access?: GitHubAccess) => {
  const response = await gistFetch(`/gists/${hex.parse(id)}`, signal, access);
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
  { access, signal }: GitHubRequest,
) => {
  const files = { [fileName]: { content: text } };
  const alreadyExists = target && Object.hasOwn(target.files, fileName);
  if (alreadyExists) throw new GistError('The snapshot file already exists.', 409);
  const body = JSON.stringify(target ? { files } : { files, public: false, description: marker });
  const path = target ? `/gists/${target.id}` : '/gists';
  try {
    const response = await gistFetch(path, signal, access, {
      method: target ? 'PATCH' : 'POST',
      body,
    });
    return gistSchema.parse(await response.json());
  } catch (cause) {
    if (cause instanceof GistError) throw cause;
    throw unknownWrite();
  }
};

const verifyWrite = async (
  gist: Gist,
  fileName: string,
  text: string,
  { access, signal }: GitHubRequest,
) => {
  const version = gist.history?.[0]?.version;
  if (!version) throw new GistError('GitHub did not confirm the save revision.', 409);
  const link = { gistId: gist.id, revision: version };
  const saved = await readRevision(link, signal, access);
  const fileMatches = saved.text === text && saved.entry.fileName === fileName;
  const ownerMatches = String(saved.gist.owner.id) === access.githubId;
  const verified = fileMatches && ownerMatches;
  if (!verified) throw new GistError('The saved bytes did not match the requested snapshot.', 409);
  return toSaved(link, fileName);
};

const readRevision = async (link: SnapshotLink, signal: AbortSignal, access?: GitHubAccess) => {
  const path = `/gists/${hex.parse(link.gistId)}/${revision.parse(link.revision)}`;
  const response = await gistFetch(path, signal, access);
  const gist = gistSchema.parse(await response.json());
  assertFileList(gist);
  const fileNames = Object.keys(gist.files);
  const entry = selectSnapshotFile(fileNames);
  return readSnapshotFile(gist, entry, signal);
};

const readSnapshotFile = async (
  gist: Gist,
  entry: NonNullable<ReturnType<typeof parseSnapshotFileName>>,
  signal: AbortSignal,
) => {
  if (!Object.hasOwn(gist.files, entry.fileName))
    throw new GistError('The previous snapshot file is unavailable.', 409);
  const text = await readFile(gist.files[entry.fileName], gist.id, entry.fileName, signal);
  const snapshot = await Effect.runPromise(decodeSnapshot(text, schemaWindow));
  const matched = snapshot.saveId === entry.saveId && snapshot.ordinal === entry.ordinal;
  if (!matched) throw new GistError('The Gist file and snapshot identifiers differ.', 422);
  return { gist, entry, snapshot, text };
};

const readFile = async (file: GistFile, gistId: string, fileName: string, signal: AbortSignal) => {
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
  signal: AbortSignal,
  access?: GitHubAccess,
  init?: RequestInit,
) => {
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': headerVersion,
  });
  if (access) headers.set('Authorization', `Bearer ${access.token}`);
  if (init?.body) headers.set('Content-Type', 'application/json');
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
