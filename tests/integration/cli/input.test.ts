// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { Effect } from 'effect';
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import { runCli } from '@/app/lib/cli';
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
  expect(showViewer).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Read input'), false);
});

test('joins piped stdin chunks and opens the viewer with the complete drawing', async () => {
  stdin(['flowchart TD\n A[Read ', 'input] --> B[Show diagram]']);
  await Effect.runPromise(runCli(undefined, options));
  expect(showViewer).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining('Show diagram'),
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
