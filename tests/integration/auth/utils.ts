import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { join, resolve } from 'node:path';
import { createAuth } from '@/packages/server/src/auth';
import { createServer } from '@/packages/server/src';
import { openDatabase } from '@/packages/server/src/auth/utils';

const schemaFile = new URL('../../../packages/server/schema.sql', import.meta.url);
const usageFile = new URL('../../../packages/server/usage.sql', import.meta.url);
const fixtureSecret = 'm2rd-test-fixture-secret-for-local-use-only';

export const startAuthFixture = async (port = 0, frontendPort = 54784) => {
  const http = createHttpServer();
  http.listen(port, '127.0.0.1');
  await once(http, 'listening');
  const address = http.address();
  if (!address) throw new Error('Fixture has no address.');
  if (typeof address === 'string') throw new Error('Expected an HTTP port.');
  const origin = `http://127.0.0.1:${address.port}`;
  const { folder, database } = createFixtureDatabase();
  const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
  const options = {
    apiOrigin: origin,
    frontendOrigin,
    database,
    secret: fixtureSecret,
    githubClientId: 'fixture-client',
    githubClientSecret: 'fixture-value',
    verifierClientId: 'fixture-verifier',
    verifierClientSecret: 'fixture-value',
  };
  const initial = createServer(options);
  const listener = initial.app.callback();
  http.on('request', listener);
  const setup = { origin, frontendOrigin, auth: initial.auth };
  const configured = await configureVerifier(options, setup);
  http.removeListener('request', listener);
  const { app, auth } = createServer(configured);
  http.on('request', app.callback());
  return {
    origin,
    frontendOrigin,
    auth,
    database,
    close: () => closeFixture(http, database, folder),
  };
};

export const githubFixtureFetch =
  (networkFetch: typeof fetch, accountId = 81): typeof fetch =>
  async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.href === 'https://github.com/login/oauth/access_token') {
      const request = new Request(input, init);
      const body = new URLSearchParams(await request.text());
      const fixtureId = /^fixture-(\d+)$/.exec(body.get('code') ?? '')?.[1];
      const access_token = `fixture-github-token-${fixtureId ?? accountId}`;
      return Response.json({ access_token, token_type: 'bearer', scope: 'gist' });
    }
    if (url.href === 'https://api.github.com/user') {
      const request = new Request(input, init);
      const token = /fixture-github-token-(\d+)$/.exec(request.headers.get('authorization') ?? '');
      const id = Number(token?.[1] ?? accountId);
      return Response.json({
        id,
        login: 'fixture',
        name: 'Fixture Name',
        email: 'fixture@example.com',
        avatar_url: 'https://example.com/photo',
        html_url: 'https://github.com/fixture',
      });
    }
    if (url.href === 'https://api.github.com/user/emails') {
      return Response.json([{ email: 'private@example.com', primary: true, verified: true }]);
    }
    const response = await networkFetch(input, init);
    return response;
  };

export const signInFixture = async (fixture: { origin: string; frontendOrigin: string }) => {
  const signIn = await fetch(fixture.origin + '/api/auth/sign-in/social', {
    method: 'POST',
    headers: { Origin: fixture.frontendOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'github',
      callbackURL: fixture.frontendOrigin + '/m2rd/',
      disableRedirect: true,
    }),
  });
  const data = await signIn.json();
  if (!signIn.ok) throw new Error(`Fixture sign in failed (${signIn.status}).`);
  const authorization = new URL(data.url);
  const state = authorization.searchParams.get('state') ?? '';
  const query = new URLSearchParams({ code: 'fixture-code', state });
  const cookie = signIn.headers
    .getSetCookie()
    .map((item) => item.split(';', 1)[0])
    .join('; ');
  const callback = await fetch(fixture.origin + '/api/auth/callback/github?' + query, {
    headers: { cookie },
    redirect: 'manual',
  });
  const session = callback.headers.getSetCookie().find((value) => value.includes('session_token='));
  if (!session)
    throw new Error(
      `The fixture GitHub callback did not establish a session (${callback.headers.get('location')}).`,
    );
  return session.split(';', 1)[0];
};
export const issueFixtureToken = async (
  fixture: Pick<Awaited<ReturnType<typeof startAuthFixture>>, 'origin' | 'frontendOrigin' | 'auth'>,
  cookie: string,
) => {
  const resource = fixture.origin + '/mcp';
  const redirect = fixture.frontendOrigin + '/callback';
  const registration = await fixture.auth.api.adminCreateOAuthClient({
    headers: new Headers({ cookie }),
    body: {
      redirect_uris: [redirect],
      application_type: 'native',
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      scope: 'mcp:tools offline_access',
      resources: [resource],
      skip_consent: true,
      require_pkce: true,
    },
  });
  const { codeVerifier, params } = authorizeParameters(registration.client_id, redirect, resource);
  const response = await fetch(fixture.origin + '/api/auth/oauth2/authorize?' + params, {
    headers: { cookie, Accept: 'text/html' },
    redirect: 'manual',
  });
  const locationHeader = response.headers.get('location');
  const target = locationHeader ?? (await response.json()).url;
  const location = new URL(target ?? fixture.origin);
  const code = location.searchParams.get('code');
  if (!code)
    throw new Error(
      `Fixture authorization failed (${response.status}, ${location.href}): OAuth did not return an authorization code.`,
    );
  const grant = { code, clientId: registration.client_id, codeVerifier, redirect, resource };
  return exchangeFixtureCode(fixture.origin, grant);
};

export const postFixtureToken = (origin: string, body: URLSearchParams) =>
  fetch(origin + '/api/auth/oauth2/token', { method: 'POST', body });

const exchangeFixtureCode = async (
  origin: string,
  {
    code,
    clientId,
    codeVerifier,
    redirect,
    resource,
  }: { code: string; clientId: string; codeVerifier: string; redirect: string; resource: string },
) => {
  const exchange = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    code_verifier: codeVerifier,
    redirect_uri: redirect,
    resource,
  });
  const token = await postFixtureToken(origin, exchange);
  const tokens = await token.json();
  if (!token.ok) throw new Error(`Fixture token exchange failed (${JSON.stringify(tokens)}).`);
  return { ...tokens, clientId };
};

const authorizeParameters = (clientId: string, redirect: string, resource: string) => {
  const codeVerifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(codeVerifier).digest('base64url');
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirect,
    scope: 'mcp:tools offline_access',
    state: 'fixture-state',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource,
  });
  return { codeVerifier, params };
};

const createFixtureDatabase = () => {
  const cache = resolve('.next/cache');
  mkdirSync(cache, { recursive: true });
  const folder = mkdtempSync(join(cache, 'm2rd-server-'));
  const database = openDatabase(join(folder, 'auth.sqlite'));
  database.exec(readFileSync(schemaFile, 'utf8'));
  database.exec(readFileSync(usageFile, 'utf8'));
  return { folder, database };
};

const configureVerifier = async (
  options: Parameters<typeof createAuth>[0],
  setup: { origin: string; frontendOrigin: string; auth: ReturnType<typeof createAuth> },
) => {
  const { origin, auth: fixtureAuth } = setup;
  const cookie = await createFixtureOperator(setup);
  const headers = new Headers({ cookie });
  const resource = origin + '/mcp';
  const verifier = await fixtureAuth.api.adminCreateOAuthClient({
    headers,
    body: {
      token_endpoint_auth_method: 'client_secret_post',
      resources: [resource],
      redirect_uris: ['https://verifier.invalid/callback'],
    },
  });
  if (!verifier.client_secret) throw new Error('The fixture verifier has no secret.');
  return {
    ...options,
    verifierClientId: verifier.client_id,
    verifierClientSecret: verifier.client_secret,
  };
};

const createFixtureOperator = async (setup: { origin: string; frontendOrigin: string }) => {
  const networkFetch = globalThis.fetch;
  globalThis.fetch = githubFixtureFetch(networkFetch, 1);
  try {
    return await signInFixture(setup);
  } finally {
    globalThis.fetch = networkFetch;
  }
};

const closeFixture = async (
  server: ReturnType<typeof createHttpServer>,
  database: ReturnType<typeof openDatabase>,
  folder: string,
) => {
  server.close();
  await once(server, 'close');
  database.close();
  rmSync(folder, { recursive: true });
};
