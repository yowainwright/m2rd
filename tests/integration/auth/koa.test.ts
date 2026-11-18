import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startAuthFixture } from './utils';

let fixture: Awaited<ReturnType<typeof startAuthFixture>>;

beforeAll(async () => {
  fixture = await startAuthFixture();
});

afterAll(async () => {
  await fixture?.close();
});

describe('Koa auth and MCP routing', () => {
  it('returns each protected resource discovery location and exact credentialed CORS', async () => {
    const paths = [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
    ];
    for (const path of paths) {
      const response = await fetch(fixture.origin + path, {
        headers: { Origin: fixture.frontendOrigin },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(fixture.frontendOrigin);
      expect(response.headers.get('Vary')).toMatch(/origin/i);
      const metadata = await response.json();
      expect(metadata.resource).toBe(fixture.origin + '/mcp');
      expect(metadata.authorization_servers).toEqual([fixture.origin + '/api/auth']);
    }
  });

  it('rejects unauthenticated requests and unsupported MCP methods', async () => {
    const url = fixture.origin + '/mcp';
    const unauthorized = await fetch(url, { method: 'POST', body: '{}' });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('WWW-Authenticate')).toContain('resource_metadata');
    const unsupported = await fetch(url, { method: 'DELETE' });
    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.get('Allow')).toBe('POST');
  });

  it('rejects an oversized body before parsing', async () => {
    const body = 'x'.repeat(1_048_577);
    const response = await fetch(fixture.origin + '/mcp', { method: 'POST', body });
    expect(response.status).toBe(413);
  });
});
