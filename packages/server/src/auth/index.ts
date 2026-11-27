import { cimd } from '@better-auth/cimd';
import { createMcpProtectedRequestHandler, mcp } from '@better-auth/mcp';
import { getOAuthProviderApi, type OAuthRefreshToken } from '@better-auth/oauth-provider';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { jwt } from 'better-auth/plugins';
import { Semaphore, Effect } from 'effect';
import { openDatabase, fetchClientMetadataResource } from './utils';
import { clearExpiredGitHubTokens, githubProviderOptions } from './clients/github/utils';
import { sessionLifetime } from './constants';
import type { AuthAdapter, ServerAuthOptions, VerifiedAccount } from './types';

const browserAuthDisabledPaths = [
  '/token',
  '/get-access-token',
  '/refresh-token',
  '/account-info',
  '/update-user',
  '/set-password',
  '/change-email',
  '/change-password',
  '/link-social',
  '/unlink-account',
];
const authPath = '/api/auth';
const accessLifetime = 900;
const toolScope = 'mcp:tools';
const authMutation = Semaphore.makeUnsafe(1);
const authCookiePaths = new Set([authPath + '/sign-out', authPath + '/oauth2/token']);

export const auth =
  process.env.M2RD_GENERATE_SCHEMA === '1'
    ? createAuth({
        database: openDatabase(':memory:'),
        apiOrigin: 'http://127.0.0.1:3000',
        frontendOrigin: 'http://127.0.0.1:54784',
        secret: 'test-schema-generation-only-never-used-at-runtime',
        githubClientId: 'schema',
        githubClientSecret: 'schema',
      })
    : undefined;

export function createAuth(options: ServerAuthOptions) {
  const issuer = options.apiOrigin + authPath;
  const resource = options.apiOrigin + '/mcp';
  const sessionOptions = getSessionOptions(options);
  return betterAuth({
    ...sessionOptions,
    plugins: [
      jwt({
        jwt: { issuer, audience: resource, expirationTime: '15m' },
        disableSettingJwtHeader: true,
      }),
      mcp({
        resource,
        loginPage: options.frontendOrigin + '/m2rd/sign-in/',
        consentPage: options.frontendOrigin + '/m2rd/consent/',
        scopes: [toolScope, 'offline_access'],
        accessTokenExpiresIn: accessLifetime,
        refreshTokenExpiresIn: sessionLifetime,
        grantTypes: ['authorization_code', 'refresh_token'],
        refreshTokenReuseInterval: 0,
      }),
      cimd({ metadataProfile: 'mcp-2026-07-28', fetchClientMetadataResource }),
    ],
    hooks: {
      before: createAuthMiddleware(checkRefreshSession),
    },
  });
}

export const protectMcp = (
  options: ServerAuthOptions,
  handler: (request: Request, account: VerifiedAccount) => Promise<Response>,
) => {
  const { verifierClientId, verifierClientSecret } = options;
  const missingVerifier = !verifierClientId || !verifierClientSecret;
  if (missingVerifier) return undefined;
  const issuer = options.apiOrigin + authPath;
  const resource = options.apiOrigin + '/mcp';
  return createMcpProtectedRequestHandler(
    {
      issuer,
      audience: resource,
      requiredScopes: [toolScope],
      remoteVerify: {
        force: true,
        introspectUrl: issuer + '/oauth2/introspect',
        clientId: verifierClientId,
        clientSecret: verifierClientSecret,
      },
    },
    async (request, claims) => {
      if (typeof claims.sub !== 'string') return new Response(null, { status: 401 });
      if (typeof claims.sid !== 'string') return new Response(null, { status: 401 });
      return handler(request, { id: claims.sub, sessionId: claims.sid });
    },
  );
};

export const verifyBrowserAccount = async (
  server: ReturnType<typeof createAuth>,
  headers: Headers,
) => {
  const result = await server.api.getSession({ headers });
  if (!result) return null;
  return { id: result.user.id, sessionId: result.session.id };
};

export const cleanupAuth = async (server: ReturnType<typeof createAuth>) => {
  const task = authMutation.withPermitsIfAvailable(1)(
    Effect.tryPromise(async () => {
      const { adapter } = await server.$context;
      await clearExpiredGitHubTokens(adapter);
      await adapter.deleteMany({
        model: 'oauthAccessToken',
        where: [{ field: 'expiresAt', value: new Date(), operator: 'lt' }],
      });
      await adapter.deleteMany({
        model: 'oauthRefreshToken',
        where: [{ field: 'expiresAt', value: new Date(), operator: 'lt' }],
      });
    }),
  );
  await Effect.runPromise(task);
};

export const handleAuth = async (
  server: ReturnType<typeof createAuth>,
  request: Request,
  origin: string,
) => {
  const path = new URL(request.url).pathname;
  const usesMutationGate = request.method === 'POST' && authCookiePaths.has(path);
  if (!usesMutationGate) return server.handler(request);
  const response = await Effect.runPromise(
    authMutation.withPermitsIfAvailable(1)(
      Effect.tryPromise(() => handleAuthMutation(server, request, origin, path)),
    ),
  );
  if (response._tag === 'Some') return response.value;
  return Response.json({ error: 'temporarily_unavailable' }, { status: 503 });
};

const handleAuthMutation = async (
  server: ReturnType<typeof createAuth>,
  request: Request,
  origin: string,
  path: string,
) => {
  if (path !== authPath + '/sign-out') return server.handler(request);
  if (request.headers.get('Origin') !== origin) return new Response(null, { status: 403 });
  await revokeAccount(server, request.headers);
  return server.handler(request);
};

const revokeAccount = async (server: ReturnType<typeof createAuth>, headers: Headers) => {
  const session = await server.api.getSession({ headers });
  if (!session) return;
  const { adapter } = await server.$context;
  const where = [{ field: 'userId', value: session.user.id }];
  await server.api.revokeSessions({ headers });
  await adapter.deleteMany({ model: 'oauthAccessToken', where });
  await adapter.deleteMany({ model: 'oauthRefreshToken', where });
};

async function checkRefreshSession(
  context: Parameters<Parameters<typeof createAuthMiddleware>[0]>[0],
) {
  const refresh = context.path === '/oauth2/token' && context.body?.grant_type === 'refresh_token';
  if (!refresh) return;
  const token = context.body?.refresh_token;
  const validToken = typeof token === 'string' && token.length > 0;
  if (!validToken) throw invalidGrant();
  const { adapter } = context.context;
  const provider = context.context.getPlugin('oauth-provider');
  if (!provider) throw invalidGrant();
  const api = getOAuthProviderApi(context, provider.options, 'refresh_token');
  const hash = await api.hashToken(token, 'refresh_token');
  const record = await adapter.findOne<OAuthRefreshToken>({
    model: 'oauthRefreshToken',
    where: [{ field: 'token', value: hash }],
  });
  if (!record?.sessionId) throw invalidGrant();
  await assertRefreshSession(adapter, record);
}

const assertRefreshSession = async (adapter: AuthAdapter, record: OAuthRefreshToken) => {
  const session = await adapter.findOne<{ userId: string; expiresAt: Date; createdAt: Date }>({
    model: 'session',
    where: [{ field: 'id', value: record.sessionId! }],
  });
  if (!session) throw invalidGrant();
  const matchesUser = session.userId === record.userId;
  const originalAuth = record.authTime ?? session.createdAt;
  const withinDeadline = Date.now() < originalAuth.getTime() + sessionLifetime * 1000;
  const sessionActive = session.expiresAt.getTime() > Date.now();
  const valid = matchesUser && withinDeadline && sessionActive;
  if (!valid) throw invalidGrant();
};

const invalidGrant = () =>
  new APIError('BAD_REQUEST', { error: 'invalid_grant', message: 'Sign in again.' });

function getSessionOptions(options: ServerAuthOptions): BetterAuthOptions {
  return {
    baseURL: options.apiOrigin,
    basePath: authPath,
    secret: options.secret,
    database: options.database,
    trustedOrigins: [options.frontendOrigin],
    disabledPaths: browserAuthDisabledPaths,
    logger: { disabled: true },
    advanced: {
      useSecureCookies: new URL(options.apiOrigin).protocol === 'https:',
    },
    session: {
      expiresIn: sessionLifetime,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    account: { encryptOAuthTokens: true, accountLinking: { enabled: false } },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => ({ data: { ...session, ipAddress: null, userAgent: null } }),
        },
        update: {
          before: async (session) => ({ data: { ...session, ipAddress: null, userAgent: null } }),
        },
      },
    },
    socialProviders: githubProviderOptions(options),
  };
}
