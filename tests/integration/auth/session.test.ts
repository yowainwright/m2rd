import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { githubFixtureFetch, signInFixture, startAuthFixture } from './utils';

let fixture: Awaited<ReturnType<typeof startAuthFixture>>;

beforeAll(async () => {
  fixture = await startAuthFixture();
  vi.stubGlobal('fetch', githubFixtureFetch(fetch));
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await fixture?.close();
});

it('links repeated GitHub logins and persists neither real profile fields nor session fingerprint fields', async () => {
  const first = await signInFixture(fixture);
  const second = await signInFixture(fixture);
  expect(first).not.toBe(second);
  const users = fixture.database
    .prepare("SELECT name, email, image FROM user WHERE email = 'github-81@m2rd.invalid'")
    .all();
  expect(users).toEqual([{ name: 'GitHub account', email: 'github-81@m2rd.invalid', image: null }]);
  const accounts = fixture.database
    .prepare("SELECT accountId, accessToken FROM account WHERE accountId = '81'")
    .all();
  expect(accounts).toHaveLength(1);
  expect(JSON.stringify(accounts)).not.toContain('fixture-github-token');
  const sessions = fixture.database
    .prepare(
      "SELECT ipAddress, userAgent FROM session JOIN user ON session.userId = user.id WHERE user.email = 'github-81@m2rd.invalid'",
    )
    .all();
  expect(sessions).toEqual([
    { ipAddress: null, userAgent: null },
    { ipAddress: null, userAgent: null },
  ]);
});

it('sign-out clears all existing sessions for the established account', async () => {
  const first = await signInFixture(fixture);
  const second = await signInFixture(fixture);
  const response = await fetch(fixture.origin + '/api/auth/sign-out', {
    method: 'POST',
    headers: { cookie: first, Origin: fixture.frontendOrigin },
  });
  expect(response.status).toBe(200);
  expect(response.headers.getSetCookie().some((cookie) => cookie.includes('Max-Age=0'))).toBe(true);
  const session = await fetch(fixture.origin + '/api/auth/get-session', {
    headers: { cookie: second },
  });
  expect(await session.json()).toBeNull();
});
