import { once } from 'node:events';
import { createReadStream, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { githubFixtureFetch, startAuthFixture } from '../integration/auth/utils';
import { githubGistsFixture } from '../integration/github/utils';

const sitePort = Number(process.env.M2RD_PREVIEW_PORT ?? 54784);
const apiPort = Number(process.env.M2RD_TEST_API_PORT ?? 54785);
const root = resolve('out');
const frozenLink = /^\/m2rd\/[a-f0-9]+-[a-f0-9]{40}$/i;
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const serve = (request: IncomingMessage, response: ServerResponse) => {
  try {
    const file = requestPath(request);
    if (!statSync(file).isFile()) throw new Error('Static path is not a file.');
    const stream = createReadStream(file);
    const mime = types[extname(file)] ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': mime });
    stream.pipe(response);
  } catch {
    response.writeHead(404);
    response.end();
  }
};

const requestPath = (request: IncomingMessage) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const address = decodeURIComponent(url.pathname);
  const appPath = address.startsWith('/m2rd/');
  if (!appPath) throw new Error('The app is served under /m2rd/.');
  if (frozenLink.test(address)) return resolve(root, 'index.html');
  const relative = address.slice('/m2rd/'.length);
  const isDirectory = relative.endsWith('/') || !relative;
  const file = isDirectory ? relative + 'index.html' : relative;
  const path = resolve(root, file);
  const inside = path.startsWith(root + sep);
  if (!inside) throw new Error('Invalid file path.');
  return path;
};

const startRuntime = async () => {
  globalThis.fetch = githubGistsFixture(githubFixtureFetch(globalThis.fetch));
  const fixture = await startAuthFixture(apiPort, sitePort);
  const server = createServer(serve);
  server.listen(sitePort, '127.0.0.1');
  await once(server, 'listening');

  const close = () => {
    server.close();
    void fixture.close();
  };

  process.once('SIGTERM', close);
  process.once('SIGINT', close);
};

await startRuntime();
