import { Effect } from 'effect';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import cors from '@koa/cors';
import { toWebRequest } from '@modelcontextprotocol/node';
import Koa from 'koa';
import { z } from 'zod';
import { cleanupAuth, createAuth, handleAuth, protectMcp, verifyBrowserAccount } from './auth';
import type { ServerAuthOptions, VerifiedAccount } from './auth/types';
import {
  AdmissionError,
  assertLiveAccount,
  createAccountAdmission,
  openDatabase,
} from './auth/utils';
import { createMcp } from './mcp';
import {
  createPublicSnapshotReader,
  discoverSnapshots,
  GistError,
  prepareSave,
  saveSnapshot,
} from './auth/clients/github';
import { getGitHubAccess } from './auth/clients/github/utils';

type McpRequest = (request: Request, account: VerifiedAccount) => Promise<Response>;

type RequestServices = {
  readPublic: ReturnType<typeof createPublicSnapshotReader>;
  auth: ReturnType<typeof createAuth>;
  admit: ReturnType<typeof createAccountAdmission>;
};

const maximumRequestBytes = 1_048_576;
const maximumSaveRequestBytes = 2 * maximumRequestBytes + 1024;
const requestDeadlineMs = 30_000;
const discoveryPrefix = '/.well-known/';
const authPath = '/api/auth';
const snapshotsPath = '/api/snapshots';
const frozenPath = /^\/api\/snapshots\/([a-f0-9]+)\/([a-f0-9]{40})$/i;
const pageNumber = z.coerce.number().int().min(1).max(2_147_483_647);
const saveSchema = z.strictObject({
  snapshot: z.string(),
  reconcileOnly: z.boolean().optional(),
  target: z
    .strictObject({
      gistId: z.string().regex(/^[a-f0-9]+$/i),
      revision: z.string().regex(/^[a-f0-9]{40}$/i),
    })
    .optional(),
  forkId: z
    .string()
    .regex(/^[a-f0-9]+$/i)
    .optional(),
});
const protocols = [
  'MCP-Protocol-Version',
  'MCP-Session-Id',
  'WWW-Authenticate',
  'DPoP-Nonce',
  'Link',
  'M2rd-Account-Id',
];
const envSchema = z.object({
  M2RD_API_ORIGIN: z.url().default('https://m2rd-api.jeffry.in'),
  M2RD_FRONTEND_ORIGIN: z.url().default('https://jeffry.in'),
  M2RD_DATABASE_PATH: z.string().min(1).default('/var/lib/m2rd/auth.sqlite'),
  BETTER_AUTH_SECRET: z.string().min(32),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  MCP_VERIFIER_CLIENT_ID: z.string().min(1).optional(),
  MCP_VERIFIER_CLIENT_SECRET: z.string().min(1).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  M2RD_TRUST_SNAPSHOT_PROXY: z.enum(['true', 'false']).default('false'),
});

export const createServer = (options: ServerAuthOptions, mcp?: McpRequest) => {
  const app = new Koa();
  const auth = createAuth(options);
  const admit = createAccountAdmission(options.database);
  const mcpHandler = mcp ?? createMcp(auth, admit);
  const protectedMcp = protectMcp(options, mcpHandler);
  const services = { auth, admit, readPublic: createPublicSnapshotReader() };
  const expectedHost = new URL(options.apiOrigin).host;
  app.silent = true;
  app.use(handleErrors);
  app.use(
    cors({
      origin: (context) => selectOrigin(context, options.frontendOrigin),
      credentials: true,
      exposeHeaders: protocols,
    }),
  );
  app.use(async (context) => {
    if (context.get('host') !== expectedHost) context.throw(403);
    const response = await dispatchRequest(context, options, services, protectedMcp);
    sendResponse(context, response);
  });
  return { app, auth };
};

const startServer = () => {
  const env = envSchema.parse(process.env);
  const database = openDatabase(env.M2RD_DATABASE_PATH);
  const options = {
    database,
    apiOrigin: new URL(env.M2RD_API_ORIGIN).origin,
    frontendOrigin: new URL(env.M2RD_FRONTEND_ORIGIN).origin,
    secret: env.BETTER_AUTH_SECRET,
    githubClientId: env.GITHUB_CLIENT_ID,
    githubClientSecret: env.GITHUB_CLIENT_SECRET,
    verifierClientId: env.MCP_VERIFIER_CLIENT_ID,
    verifierClientSecret: env.MCP_VERIFIER_CLIENT_SECRET,
    trustSnapshotProxy: env.M2RD_TRUST_SNAPSHOT_PROXY === 'true',
  };
  const { app, auth } = createServer(options);
  const cleanup = setInterval(() => {
    void cleanupAuth(auth).catch(() => {});
  }, 3_600_000);
  cleanup.unref();
  void cleanupAuth(auth).catch(() => {});
  const server = app.listen(env.PORT, '127.0.0.1');
  const close = () => {
    clearInterval(cleanup);
    server.close(() => database.close());
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
};

const dispatchRequest = async (
  context: Koa.Context,
  options: ServerAuthOptions,
  services: RequestServices,
  protectedMcp: ReturnType<typeof protectMcp>,
) => {
  if (context.path === '/mcp') return dispatchMcp(context, options.apiOrigin, protectedMcp);
  if (context.path.startsWith(snapshotsPath)) {
    const request = await getWebRequest(context, options.apiOrigin, maximumSaveRequestBytes);
    const peer = snapshotPeer(context, options.trustSnapshotProxy);
    return dispatchSnapshots(request, options.frontendOrigin, services, peer);
  }
  const isAuth =
    context.path.startsWith(authPath + '/') || context.path.startsWith(discoveryPrefix);
  if (isAuth) {
    const request = await getWebRequest(context, options.apiOrigin);
    return handleAuth(services.auth, request, options.frontendOrigin);
  }
  return new Response(null, { status: 404 });
};

const snapshotPeer = (context: Koa.Context, trustProxy = false) => {
  const peer = context.req.socket.remoteAddress ?? 'unknown';
  const trusted = trustProxy && peer === '127.0.0.1';
  if (!trusted) return peer;
  const forwarded = context.get('X-Forwarded-For').split(',').at(-1)?.trim();
  const valid = forwarded && isIP(forwarded);
  return valid ? forwarded : peer;
};

const dispatchSnapshots = async (
  request: Request,
  origin: string,
  services: RequestServices,
  peer: string,
) => {
  const path = new URL(request.url).pathname;
  const frozen = frozenPath.exec(path);
  const readsRevision = frozen && request.method === 'GET';
  if (readsRevision) {
    const [, gistId, revision] = frozen;
    const loaded = await services.readPublic(gistId, revision, peer, request.signal);
    return Response.json(loaded);
  }
  if (path !== snapshotsPath) return new Response(null, { status: 404 });
  const account = await verifyBrowserAccount(services.auth, request.headers);
  if (!account) return new Response(null, { status: 401 });
  if (request.method === 'GET') return listAccountSnapshots(request, services, account);
  return dispatchAccountSnapshot(request, origin, services, account);
};

const listAccountSnapshots = async (
  request: Request,
  { auth, admit }: RequestServices,
  account: VerifiedAccount,
) => {
  const query = new URL(request.url).searchParams;
  const requested = pageNumber.safeParse(query.get('page') ?? 1);
  if (!requested.success) return new Response(null, { status: 400 });
  const owner = query.get('account');
  const switched = owner !== null && owner !== account.id;
  const page = switched ? 1 : requested.data;
  const result = await Effect.runPromise(
    admit(account.id, (charge) =>
      Effect.tryPromise({
        try: async () => {
          const access = await getGitHubAccess(auth, account);
          return discoverSnapshots(access, request.signal, page, charge);
        },
        catch: (cause) => (cause instanceof Error ? cause : new Error('Snapshot listing failed.')),
      }),
    ),
  );
  const headers = new Headers({
    'M2rd-Account-Id': account.id,
    'Cache-Control': 'private, no-store',
  });
  if (result.hasNext) {
    const next = new URLSearchParams({ page: String(page + 1), account: account.id });
    headers.set('Link', `<${snapshotsPath}?${next}>; rel="next"`);
  }
  return Response.json(result.snapshots, { headers });
};

const dispatchAccountSnapshot = async (
  request: Request,
  origin: string,
  { auth, admit }: RequestServices,
  account: VerifiedAccount,
) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (request.headers.get('origin') !== origin) return new Response(null, { status: 403 });
  const input = saveSchema.safeParse(await request.json());
  if (!input.success) return Response.json({ error: 'Invalid save request.' }, { status: 400 });
  const saved = await Effect.runPromise(
    admit(account.id, (charge) =>
      Effect.tryPromise({
        try: async () => {
          charge();
          const access = await getGitHubAccess(auth, account);
          const prepared = await prepareSave(input.data, access, request.signal);
          if (prepared.existing) return prepared.existing;
          await assertLiveAccount(auth, account);
          return saveSnapshot(prepared, access, request.signal);
        },
        catch: (cause) =>
          cause instanceof Error ? cause : new Error('The save could not be completed.'),
      }),
    ),
  );
  return Response.json(saved);
};

const dispatchMcp = async (
  context: Koa.Context,
  origin: string,
  handler: ReturnType<typeof protectMcp>,
) => {
  if (!handler) return new Response(null, { status: 503 });
  if (context.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }
  const request = await getWebRequest(context, origin);
  return handler(request);
};

const getWebRequest = async (
  context: Koa.Context,
  origin: string,
  maxRequestBodySize = maximumRequestBytes,
) => {
  const controller = new AbortController();
  context.res.once('close', () => controller.abort());
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(requestDeadlineMs)]);
  const stopReading = () => {
    if (!context.req.complete) context.req.destroy();
  };
  signal.addEventListener('abort', stopReading, { once: true });
  const request = await toWebRequest(context.req, undefined, {
    signal,
    maxRequestBodySize,
  }).finally(() => signal.removeEventListener('abort', stopReading));
  const path = new URL(request.url);
  const url = new URL(origin);
  url.pathname = path.pathname;
  url.search = path.search;
  return new Request(url, request);
};

const sendResponse = (context: Koa.Context, response: Response) => {
  response.headers.forEach((value, name) => {
    if (name === 'set-cookie') return;
    context.set(name, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) context.set('Set-Cookie', cookies);
  if (response.body) context.body = Readable.fromWeb(response.body as NodeReadableStream);
  context.status = response.status;
};

const handleErrors: Koa.Middleware = async (context, next) => {
  try {
    await next();
  } catch (cause) {
    const status = getErrorStatus(cause);
    if (status === 413) context.req.resume();
    const operationError = cause instanceof GistError || cause instanceof AdmissionError;
    if (operationError) {
      const forkId = cause instanceof GistError ? cause.forkId : undefined;
      const outcomeUnknown = cause instanceof GistError && cause.outcomeUnknown;
      context.body = { error: cause.message, forkId, outcomeUnknown };
      context.status = status;
      return;
    }
    const error = status < 500 ? 'Request rejected.' : 'The request could not be completed.';
    context.body = { error };
    context.status = status;
  }
};

const getErrorStatus = (cause: unknown) => {
  if (!(cause instanceof Error)) return 500;
  if (cause.name === 'TimeoutError') return 504;
  if (cause instanceof SyntaxError) return 400;
  const status = Reflect.get(cause, 'statusCode') ?? Reflect.get(cause, 'status');
  if (typeof status !== 'number') return 500;
  const recognized = status >= 400 && status <= 599;
  return recognized ? status : 500;
};

const selectOrigin = (context: Koa.Context, origin: string) => {
  context.vary('Origin');
  const isAllowed = context.get('origin') === origin;
  return isAllowed ? origin : '';
};

if (import.meta.main) startServer();
