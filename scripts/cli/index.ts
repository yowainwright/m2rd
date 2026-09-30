import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Effect } from 'effect';
import { build } from 'rolldown';
import type { Plugin } from 'rolldown';
import { packageConfig } from './package.config.ts';

const require = createRequire(import.meta.url);
const jsdom = require.resolve('jsdom');
const cssTree = createRequire(jsdom).resolve('css-tree/dist/csstree.esm');
const stylesheet = resolve(dirname(jsdom), 'jsdom/browser/default-stylesheet.css');
const fonts = resolve(dirname(require.resolve('svgdom')), 'fonts');
const worker = require.resolve('jsdom/lib/jsdom/living/xhr/xhr-sync-worker.js');

const embedStylesheet = (source: string) => {
  const statement = /const defaultStyleSheet = fs\.readFileSync\([\s\S]*?\n\);/;
  if (!statement.test(source)) throw new Error('JSDOM stylesheet loader changed.');
  const css = JSON.stringify(readFileSync(stylesheet, 'utf8'));
  return source.replace(statement, () => `const defaultStyleSheet = ${css};`);
};

const relocateWorker = (source: string) => {
  const statement = 'require.resolve("./xhr-sync-worker.js")';
  if (!source.includes(statement)) throw new Error('JSDOM worker loader changed.');
  const location =
    'require("node:url").fileURLToPath(new URL("./xhr-sync-worker.mjs", import.meta.url))';
  return source.replace(statement, location);
};

const relocateFonts = (source: string) => {
  const location = "join(fileDirname, '../../', 'fonts/')";
  if (!source.includes(location)) throw new Error('SVGDOM font directory changed.');
  return source.replace(location, 'fileDirname');
};

const transform = (source: string, id: string) => {
  if (id.endsWith('/living/css/helpers/computed-style.js')) return embedStylesheet(source);
  if (id.endsWith('/living/xhr/XMLHttpRequest-impl.js')) return relocateWorker(source);
  if (id.endsWith('/svgdom/src/utils/defaults.js')) return relocateFonts(source);
};

const runtimeAssets: Plugin = {
  name: 'cli-runtime-files',
  resolveId(id) {
    if (id === 'css-tree') return cssTree;
  },
  buildStart() {
    const font = readFileSync(resolve(fonts, 'OpenSans-Regular.ttf'));
    const license = readFileSync(resolve(fonts, 'Apache License.txt'));
    this.emitFile({ type: 'asset', fileName: 'OpenSans-Regular.ttf', source: font });
    this.emitFile({ type: 'asset', fileName: 'FONT_LICENSE.txt', source: license });
  },
  transform,
};

const root = resolve(import.meta.dirname, '../..');
const temporary = join(root, 'tmp');
const npmArgs = [
  'pack',
  '--json',
  '--ignore-scripts',
  '--offline',
  '--cache',
  join(temporary, 'npm-cache'),
  '--pack-destination',
  temporary,
];

const prepare = () => {
  mkdirSync(temporary, { recursive: true });
  return mkdtempSync(join(temporary, 'cli-package-'));
};

const packageManifest = () => {
  const project = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const { name, version, description, author, license, repository } = project;
  return {
    name,
    version,
    description,
    author,
    license,
    repository,
    private: true,
    type: 'module',
    bin: { m2rd: 'm2rd-cli.mjs' },
    files: ['*.mjs', '*.ttf', '*.txt'],
    engines: { node: '^22.22.2 || ^24.15.0 || >=26.0.0' },
  };
};

const writeManifest = (directory: string) => {
  const manifest = packageManifest();
  writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest, null, 2));
  copyFileSync(join(root, 'LICENSE'), join(directory, 'LICENSE'));
  copyFileSync(join(root, 'README.md'), join(directory, 'README.md'));
  chmodSync(join(directory, 'm2rd-cli.mjs'), 0o755);
};

const pack = (directory: string) => {
  const result = execFileSync('npm', npmArgs, { cwd: directory, encoding: 'utf8' });
  const [artifact] = JSON.parse(result);
  const path = join(temporary, artifact.filename);
  const summary = { path, bytes: artifact.size, unpackedBytes: artifact.unpackedSize };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
};

const packageCli = Effect.gen(function* () {
  const directory = yield* Effect.acquireRelease(Effect.sync(prepare), (path) =>
    Effect.sync(() => rmSync(path, { recursive: true, force: true })),
  );
  const configuration = packageConfig(directory, runtimeAssets, worker);
  yield* Effect.tryPromise(() => build(configuration));
  yield* Effect.sync(() => writeManifest(directory));
  yield* Effect.sync(() => pack(directory));
});

await Effect.runPromise(Effect.scoped(packageCli));
