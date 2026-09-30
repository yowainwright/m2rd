import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const temporary = resolve(root, 'tmp');
mkdirSync(temporary, { recursive: true });
const directory = mkdtempSync(resolve(temporary, 'cli-package-test-'));
const installation = resolve(directory, 'install');
const project = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const installed = resolve(installation, 'node_modules', project.name);
const cli = resolve(installation, 'node_modules/.bin/m2rd');
const permissions = [
  '--permission',
  `--allow-fs-read=${directory}`,
  `--allow-fs-write=${directory}`,
];
const env: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  NODE_ENV: 'production',
  CI: 'true',
  DEV: 'true',
  FORCE_COLOR: '0',
};
let artifact: { path: string; bytes: number; unpackedBytes: number };

const install = (archive: string) => {
  const args = [
    'install',
    '--prefix',
    installation,
    '--offline',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--package-lock=false',
    '--cache',
    resolve(directory, 'cache'),
    archive,
  ];
  execFileSync('npm', args, { cwd: directory, encoding: 'utf8', timeout: 60_000 });
};

beforeAll(() => {
  const script = resolve(root, 'scripts/cli/index.ts');
  const result = execFileSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
  });
  artifact = JSON.parse(result);
  install(artifact.path);
}, 180_000);

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const run = (args: string[], input = '') => {
  const result = spawnSync(process.execPath, [...permissions, cli, ...args], {
    cwd: directory,
    input,
    env,
    encoding: 'utf8',
    timeout: 30_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return result;
};

const expectSuccess = (result: ReturnType<typeof run>) => {
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
};

const expectSvg = (path: string, label: string) => {
  const image = new JSDOM(readFileSync(path, 'utf8'), { contentType: 'image/svg+xml' });
  try {
    const svg = image.window.document.documentElement;
    expect(svg.localName).toBe('svg');
    expect(svg.textContent).toContain(label);
  } finally {
    image.window.close();
  }
};

test('installs an npm command without runtime dependencies or lifecycle scripts', () => {
  const manifest = JSON.parse(readFileSync(resolve(installed, 'package.json'), 'utf8'));
  expect(manifest.name).toBe(project.name);
  expect(manifest.version).toBe(project.version);
  expect(manifest.dependencies ?? {}).toEqual({});
  expect(manifest.optionalDependencies ?? {}).toEqual({});
  expect(manifest.peerDependencies ?? {}).toEqual({});
  expect(manifest.scripts ?? {}).toEqual({});
  expect(existsSync(cli)).toBe(true);
  expect(artifact.bytes).toBeLessThan(10_000_000);
});

test('ships the font, worker, and third-party license notices', () => {
  expect(readFileSync(resolve(installed, 'OpenSans-Regular.ttf')).length).toBeGreaterThan(0);
  expect(readFileSync(resolve(installed, 'xhr-sync-worker.mjs')).length).toBeGreaterThan(0);
  expect(readFileSync(resolve(installed, 'FONT_LICENSE.txt'), 'utf8')).toContain('Apache');
  const notices = readFileSync(resolve(installed, 'THIRD_PARTY_LICENSES.txt'), 'utf8');
  ['mermaid', 'ink', 'jsdom', 'svgdom'].forEach((name) => expect(notices).toContain(name));
});

test('prints help through the installed npm command', () => {
  const result = run(['--help']);
  expectSuccess(result);
  expect(result.stdout).toContain('--output');
  expect(result.stdout).toContain('--styleguide');
});

test.each([
  ['flowchart', 'flowchart LR\n A[Start] --> B[Finish]', 'Start'],
  ['sequence', 'sequenceDiagram\n Alice->>Bob: Request', 'Request'],
  ['state', 'stateDiagram-v2\n [*] --> Ready\n Ready --> Done', 'Ready'],
  ['class', 'classDiagram\n Animal <|-- Duck', 'Animal'],
  ['er', 'erDiagram\n CUSTOMER ||--o{ ORDER : places', 'CUSTOMER'],
  ['gantt', 'gantt\n dateFormat YYYY-MM-DD\n section Work\n Task :2026-09-29, 1d', 'Task'],
])('exports %s SVG without access to project source or dependencies', (name, source, label) => {
  const output = resolve(directory, `${name}.svg`);
  expectSuccess(run(['--output', output], source));
  expectSvg(output, label);
});

test('exports a Mermaid block from a Markdown file', () => {
  const input = resolve(directory, 'example.md');
  const output = resolve(directory, 'markdown.svg');
  writeFileSync(input, '# Example\n\n```mermaid\nflowchart TD\n A[Markdown] --> B\n```');
  expectSuccess(run([input, '-o', output]));
  expectSvg(output, 'Markdown');
});

test('renders the styleguide without a terminal', () => {
  const result = run(['--styleguide', '--ascii']);
  expectSuccess(result);
  expect(result.stdout).toContain('Mermaid');
  expect(result.stdout).toContain('Colors');
  expect(result.stdout).not.toMatch(/[\u2500-\u257f]/u);
});

test('exports the styleguide SVG without a terminal', () => {
  const output = resolve(directory, 'styleguide.svg');
  expectSuccess(run(['--styleguide', '--output', output]));
  expectSvg(output, 'm2rd Mermaid theme');
});

test('reports invalid input and leaves no output file', () => {
  const output = resolve(directory, 'invalid.svg');
  const result = run(['--output', output], 'not mermaid');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('No diagram type');
  expect(existsSync(output)).toBe(false);
});

test('preserves an existing output file', () => {
  const output = resolve(directory, 'existing.svg');
  writeFileSync(output, 'original');
  const result = run(['--output', output], 'flowchart TD\n A --> B');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('EEXIST');
  expect(readFileSync(output, 'utf8')).toBe('original');
});
