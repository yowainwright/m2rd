import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { Effect } from 'effect';
import { JSDOM } from 'jsdom';
import stringWidth from 'string-width';
import { createActor, waitFor } from 'xstate';
import { afterAll, afterEach, expect, test, vi } from 'vitest';
import { runStyleguide } from '@/app/lib/cli/styleguide';
import { STYLEGUIDE_EXPORT_PATH, STYLEGUIDE_VIEWPORT } from '@/app/lib/cli/styleguide/constants';
import { svgStyleguideSource } from '@/app/lib/cli/styleguide/utils';
import { svgTheme } from '@/app/lib/cli/themes/mermaid/constants';
import { showViewer } from '@/app/lib/cli/viewer';
import { VIEWER_MACHINE } from '@/app/lib/cli/viewer/constants';

vi.mock('@/app/lib/cli/viewer', () => ({ showViewer: vi.fn() }));

const root = resolve(import.meta.dirname, '../../../tmp');
mkdirSync(root, { recursive: true });
const directory = mkdtempSync(resolve(root, 'styleguide-save-'));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const createViewer = (path: string) => {
  const source = svgStyleguideSource();
  const svgExport = { source, path };
  const input = {
    contentWidth: 59,
    contentHeight: 22,
    width: 59,
    height: 22,
    left: 0,
    top: 0,
    svgExport,
  };
  return createActor(VIEWER_MACHINE, { input }).start();
};

test('exposes the SVG export in the interactive styleguide', async () => {
  const stdout = Object.create(process.stdout);
  Object.defineProperty(stdout, 'isTTY', { value: true });
  vi.spyOn(process, 'stdout', 'get').mockReturnValue(stdout);
  vi.stubEnv('CI', '');
  vi.stubEnv('GITHUB_ACTIONS', '');
  vi.mocked(showViewer).mockReturnValue(Effect.void);
  await Effect.runPromise(runStyleguide({ width: 80, ascii: false }));
  expect(showViewer).toHaveBeenCalledWith(
    expect.stringContaining('Colors'),
    false,
    STYLEGUIDE_VIEWPORT,
    { source: svgStyleguideSource(), path: STYLEGUIDE_EXPORT_PATH },
  );
  const content = String(vi.mocked(showViewer).mock.calls[0][0]);
  expect(Math.max(...content.split('\n').map((line) => stringWidth(line)))).toBe(59);
});

test.each(['pipe', 'CI'])('preserves requested width in a %s styleguide preview', async (mode) => {
  const write = vi.fn((_chunk: string) => true);
  const stdout = Object.create(process.stdout);
  Object.defineProperties(stdout, {
    isTTY: { value: mode === 'CI' },
    write: { value: write },
  });
  vi.spyOn(process, 'stdout', 'get').mockReturnValue(stdout);
  vi.stubEnv('CI', mode === 'CI' ? 'true' : '');
  vi.stubEnv('GITHUB_ACTIONS', '');
  await Effect.runPromise(runStyleguide({ width: 120, ascii: true }));
  const content = String(write.mock.calls[0][0]);
  expect(content).toMatch(/Mermaid[\s\S]*Colors/);
  expect(Math.max(...content.split('\n').map((line) => stringWidth(line)))).toBe(120);
  expect(content).not.toMatch(/[\u2500-\u257f]/u);
  expect(showViewer).not.toHaveBeenCalled();
});

test('exports the styleguide SVG directly without opening a viewer', async () => {
  const output = resolve(directory, 'direct.svg');
  await Effect.runPromise(runStyleguide({ width: 80, ascii: false, output }));
  const image = new JSDOM(readFileSync(output, 'utf8'), { contentType: 'image/svg+xml' });
  expect(image.window.document.documentElement.localName).toBe('svg');
  expect(image.window.document.documentElement.textContent).toContain('m2rd Mermaid theme');
  image.window.close();
  expect(showViewer).not.toHaveBeenCalled();
});

test('saves a real themed SVG and preserves it when saving again', async () => {
  const path = resolve(directory, 'sample.svg');
  const actor = createViewer(path);
  try {
    actor.send({ type: 'save' });
    await waitFor(actor, (state) => state.context.message?.startsWith('Saved ') === true);
    const saved = readFileSync(path, 'utf8');
    expect(saved).toContain('<svg');
    expect(saved).toContain(svgTheme.themeVariables.primaryColor);
    const image = new JSDOM(saved, { contentType: 'image/svg+xml' });
    expect(image.window.document.documentElement.textContent).toContain('Shapes and connectors');
    image.window.close();
    actor.send({ type: 'save' });
    await waitFor(actor, (state) => state.context.message?.startsWith('Save failed:') === true);
    expect(actor.getSnapshot().context.message).toContain('EEXIST');
    expect(readFileSync(path, 'utf8')).toBe(saved);
    expect(actor.getSnapshot().value).toBe('viewing');
  } finally {
    actor.stop();
  }
});

test('reports a write failure and keeps the viewer usable', async () => {
  const actor = createViewer(resolve(directory, 'missing', 'sample.svg'));
  try {
    actor.send({ type: 'save' });
    await waitFor(actor, (state) => state.context.message?.startsWith('Save failed:') === true);
    expect(actor.getSnapshot().context.message).toContain('ENOENT');
    expect(actor.getSnapshot().value).toBe('viewing');
    actor.send({ type: 'quit' });
    expect(actor.getSnapshot().status).toBe('done');
  } finally {
    actor.stop();
  }
});
