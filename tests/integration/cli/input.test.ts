import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { Effect } from 'effect';
import { JSDOM } from 'jsdom';
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import { runCli } from '@/app/lib/cli/utils';
import { showViewer } from '@/app/lib/cli/viewer';

vi.mock('@/app/lib/cli/viewer', () => ({ showViewer: vi.fn() }));

const temporaryRoot = resolve(import.meta.dirname, '../../../tmp');
mkdirSync(temporaryRoot, { recursive: true });
const directory = mkdtempSync(resolve(temporaryRoot, 'cli-input-'));
const path = resolve(directory, 'chart.mmd');
const options = { width: 80, ascii: false };
const source = 'flowchart TD\n A[Read input] --> B[Show diagram]';

const stdin = (chunks: string[], isTTY = false) => {
  const stream = Object.assign(Readable.from(chunks), { isTTY });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(stream as typeof process.stdin);
  return stream;
};

beforeEach(() => vi.mocked(showViewer).mockReturnValue(Effect.void));
afterEach(() => vi.restoreAllMocks());
afterEach(() => vi.clearAllMocks());
afterAll(() => rmSync(directory, { recursive: true, force: true }));

test('reads a Mermaid file and hands its rendered drawing to the viewer', async () => {
  writeFileSync(path, source);
  await Effect.runPromise(runCli(path, options));
  expect(showViewer).toHaveBeenCalledExactlyOnceWith(
    [{ diagram: expect.stringContaining('Read input'), label: path }],
    false,
  );
});

test('joins piped stdin chunks and opens the viewer with the complete drawing', async () => {
  stdin(['flowchart TD\n A[Read ', 'input] --> B[Show diagram]']);
  await Effect.runPromise(runCli(undefined, options));
  expect(showViewer).toHaveBeenCalledExactlyOnceWith(
    [{ diagram: expect.stringContaining('Show diagram'), label: 'stdin' }],
    false,
  );
});

test('rejects malformed Mermaid before opening the viewer', async () => {
  stdin(['flowchart TD\n A[unterminated']);
  await expect(Effect.runPromise(runCli(undefined, options))).rejects.toThrow();
  expect(showViewer).not.toHaveBeenCalled();
});

test('rejects empty piped input before opening the viewer', async () => {
  stdin([' \n']);
  await expect(Effect.runPromise(runCli(undefined, options))).rejects.toThrow('Input is empty');
  expect(showViewer).not.toHaveBeenCalled();
});

test('requires input when launched from a terminal without a file', async () => {
  const stream = stdin([], true);
  const read = vi.spyOn(stream, 'setEncoding');
  await expect(Effect.runPromise(runCli(undefined, options))).rejects.toThrow('Input required');
  expect(read).not.toHaveBeenCalled();
  expect(showViewer).not.toHaveBeenCalled();
});

test('reports a missing input file without opening the viewer', async () => {
  const missing = resolve(directory, 'missing.mmd');
  await expect(Effect.runPromise(runCli(missing, options))).rejects.toThrow('ENOENT');
  expect(showViewer).not.toHaveBeenCalled();
});

test.each(['file', 'stdin'])(
  'exports SVG from %s without opening the terminal viewer',
  async (input) => {
    const output = resolve(directory, `${input}.svg`);
    writeFileSync(path, source);
    const inputPath = input === 'file' ? path : undefined;
    if (input === 'stdin') stdin([source]);
    const exporting = Object.assign({}, options, { output });
    await Effect.runPromise(runCli(inputPath, exporting));
    const image = new JSDOM(readFileSync(output, 'utf8'), { contentType: 'image/svg+xml' });
    expect(image.window.document.documentElement.localName).toBe('svg');
    expect(image.window.document.documentElement.textContent).toContain('Read input');
    image.window.close();
    expect(showViewer).not.toHaveBeenCalled();
  },
);

test('does not create an SVG file when piped input is malformed', async () => {
  const output = resolve(directory, 'invalid.svg');
  stdin(['flowchart TD\n A[unterminated']);
  const exporting = Object.assign({}, options, { output });
  await expect(Effect.runPromise(runCli(undefined, exporting))).rejects.toThrow();
  expect(existsSync(output)).toBe(false);
  expect(showViewer).not.toHaveBeenCalled();
});

const markdown = (text: string) => `# Example\n\n\`\`\`mermaid\n${text}\n\`\`\`\n`;

test('extracts Mermaid from piped Markdown and ignores other fenced code', async () => {
  stdin(['# Examples\n\n```js\nnot a diagram\n```\n', markdown(source)]);
  await Effect.runPromise(runCli(undefined, options));
  expect(showViewer).toHaveBeenCalledExactlyOnceWith(
    [{ label: 'stdin', diagram: expect.stringContaining('Read input') }],
    false,
  );
});

test('preserves file and block order, including duplicates, while skipping empty docs', async () => {
  const first = resolve(directory, 'first.md');
  const empty = resolve(directory, 'empty.md');
  const prose = resolve(directory, 'prose.md');
  const last = resolve(directory, 'last.markdown');
  writeFileSync(first, markdown(source).repeat(2));
  writeFileSync(empty, '');
  writeFileSync(prose, '# Nothing to render\n');
  writeFileSync(last, markdown('sequenceDiagram\n Alice->>Bob: Hello'));
  await Effect.runPromise(runCli([first, empty, prose, last], options));
  expect(showViewer).toHaveBeenCalledExactlyOnceWith(
    [
      { label: first, diagram: expect.stringContaining('Read input') },
      { label: first, diagram: expect.stringContaining('Read input') },
      { label: last, diagram: expect.stringContaining('Alice') },
    ],
    false,
  );
});

test('extracts nested and tilde fences without treating a quoted example fence as a diagram', async () => {
  const example = '````text\n```mermaid\ninvalid example\n```\n````\n';
  const quoted = '> ~~~mermaid\n> flowchart TD\n> A[Quoted]-->B\n> ~~~\n';
  const listed = '- Example\n\n  ```mermaid\n  flowchart TD\n  A[Listed]-->B\n  ```\n';
  stdin([example, quoted, '\n', listed]);
  await Effect.runPromise(runCli(undefined, options));
  expect(showViewer).toHaveBeenCalledExactlyOnceWith(
    [
      { label: 'stdin', diagram: expect.stringContaining('Quoted') },
      { label: 'stdin', diagram: expect.stringContaining('Listed') },
    ],
    false,
  );
});

test('reports when the selected Markdown documents contain no diagrams', async () => {
  const path = resolve(directory, 'no-diagrams.md');
  writeFileSync(path, '# Plain text\n\n```js\nconst example = 1;\n```');
  await expect(Effect.runPromise(runCli([path], options))).rejects.toThrow('No Mermaid diagrams');
  expect(showViewer).not.toHaveBeenCalled();
});

test('exports a single Markdown diagram and rejects ambiguous output before writing', async () => {
  const path = resolve(directory, 'export.md');
  const output = resolve(directory, 'markdown.svg');
  const exporting = Object.assign({}, options, { output });
  writeFileSync(path, markdown(source).repeat(2));
  await expect(Effect.runPromise(runCli(path, exporting))).rejects.toThrow('exactly one diagram');
  expect(existsSync(output)).toBe(false);
  writeFileSync(path, markdown(source));
  await Effect.runPromise(runCli(path, exporting));
  expect(readFileSync(output, 'utf8')).toContain('<svg');
  expect(showViewer).not.toHaveBeenCalled();
});
