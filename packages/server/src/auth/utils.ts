import { lookup } from 'node:dns/promises';
import type { IncomingMessage } from 'node:http';
import { request as requestHttps } from 'node:https';
import type { ClientMetadataResourceFetch } from '@better-auth/oauth-provider';
import { Address4, Address6 } from 'ip-address';
import Database from 'better-sqlite3';
import { Effect } from 'effect';
import type { UsageLimit } from './types';

export class AdmissionError extends Error {
  readonly status = 429;
}

const minuteMs = 60_000;
const dayMs = 86_400_000;
const minuteLimit = 10;
const dayLimit = 100;

export const openDatabase = (path: string) => {
  const database = new Database(path);
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  return database;
};

export const createAccountAdmission = (database: Database.Database) => {
  const charge = createUsageCounter(database);
  const active = new Set<string>();
  return <A, E>(id: string, operation: (chargeOperation: () => void) => Effect.Effect<A, E>) =>
    Effect.acquireUseRelease(
      Effect.try({ try: () => reserveAccount(id, active), catch: toError }),
      () =>
        operation(() => {
          const limit = charge(id, Date.now());
          if (limit) throw new AdmissionError(`Account ${limit} limit reached.`);
        }),
      () =>
        Effect.sync(() => {
          active.delete(id);
        }),
    );
};

export const createUsageCounter = (database: Database.Database) => {
  const read = database.prepare<[string, UsageLimit, number], { count: number }>(
    'SELECT count FROM usage WHERE user_id = ? AND window_type = ? AND window_start = ?',
  );
  const increment = database.prepare<[string, UsageLimit, number]>(`
    INSERT INTO usage (user_id, window_type, window_start, count) VALUES (?, ?, ?, 1)
    ON CONFLICT (user_id, window_type, window_start) DO UPDATE SET count = count + 1
  `);
  const prune = database.prepare<[number, number]>(`
    DELETE FROM usage WHERE (window_type = 'minute' AND window_start < ?)
      OR (window_type = 'day' AND window_start < ?)
  `);
  const charge = database.transaction((userId: string, now: number): UsageLimit | null => {
    const minute = now - (now % minuteMs);
    const day = now - (now % dayMs);
    const minuteUsed = read.get(userId, 'minute', minute)?.count ?? 0;
    if (minuteUsed >= minuteLimit) return 'minute';
    const dayUsed = read.get(userId, 'day', day)?.count ?? 0;
    if (dayUsed >= dayLimit) return 'day';
    increment.run(userId, 'minute', minute);
    increment.run(userId, 'day', day);
    prune.run(minute, day);
    return null;
  });
  return charge.immediate;
};

export const fetchClientMetadataResource: ClientMetadataResourceFetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:') throw new Error('Client metadata requires HTTPS.');
  const addresses = await lookup(hostname, { all: true });
  const blocked = addresses.some(({ address, family }) => !isGlobalAddress(address, family));
  if (blocked) throw new Error('Client metadata host must resolve to a public address.');
  const target = addresses[0];
  if (!target) throw new Error('Client metadata host has no public address.');
  return requestMetadata(url, request, target);
};

const reserveAccount = (id: string, active: Set<string>) => {
  if (active.has(id))
    throw new AdmissionError('An operation is already in progress for this account.');
  active.add(id);
};

const toError = (cause: unknown) =>
  cause instanceof Error ? cause : new Error('Account admission failed.');

const isGlobalAddress = (address: string, family: number) => {
  if (family === 4) return new Address4(address).isGlobal();
  if (family === 6) return new Address6(address).isGlobal();
  return false;
};

const requestMetadata = (url: URL, input: Request, target: { address: string; family: number }) =>
  new Promise<Response>((resolve, reject) => {
    const signal = AbortSignal.any([input.signal, AbortSignal.timeout(5000)]);
    const headers = Object.fromEntries(input.headers);
    const request = requestHttps(
      url,
      {
        method: 'GET',
        headers,
        signal,
        agent: false,
        family: target.family,
        lookup: (_host, _options, callback) => callback(null, target.address, target.family),
      },
      (response) => {
        readMetadataResponse(response).then(resolve, reject);
      },
    );
    request.on('error', reject);
    request.end();
  });

const readMetadataResponse = async (response: IncomingMessage) => {
  const chunks = new Set<Buffer>();
  let size = 0;
  for await (const chunk of response) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 262_144) throw new Error('Client metadata exceeds the size limit.');
    chunks.add(bytes);
  }
  const status = response.statusCode ?? 502;
  const hasBody = ![204, 205, 304].includes(status);
  const body = hasBody ? Buffer.concat(Array.from(chunks)) : null;
  const headers = new Headers();
  Object.entries(response.headersDistinct).forEach(([key, values]) => {
    if (values) headers.set(key, values.join(', '));
  });
  return new Response(body, { status, headers });
};
