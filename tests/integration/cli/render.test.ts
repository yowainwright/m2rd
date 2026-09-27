// @vitest-environment node
import { stripVTControlCharacters } from 'node:util';
import { Effect } from 'effect';
import * as ink from 'ink';
import { afterEach, expect, test, vi } from 'vitest';
import { renderDiagram } from '@/app/lib/cli';
import { renderSequence } from '@/app/lib/cli/renders/sequence';
import { renderMermaid } from '@/app/lib/cli/utils';

vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof ink>();
  const renderToString = vi.fn(actual.renderToString);
  return Object.assign({}, actual, { renderToString });
});

const options = { width: 80, ascii: false };
const draw = async (source: string, ascii = false) => {
  const settings = Object.assign({}, options, { ascii });
  const output = await Effect.runPromise(renderDiagram(source, settings));
  return stripVTControlCharacters(output);
};

afterEach(() => vi.restoreAllMocks());

test('renders a horizontal flowchart vertically with full labels and branch captions', async () => {
  const source = 'flowchart LR\n A[Load config] --> B{Security?}\n B -->|Yes| C[Scan providers]';
  const output = await draw(source);
  const lines = output.split('\n');
  const start = lines.findIndex((line) => line.includes('Load config'));
  const end = lines.findIndex((line) => line.includes('Scan providers'));
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  expect(output).toContain('Security?');
  expect(output).toContain('Yes');
  expect(output).toContain('│');
});

test('keeps sequence participants, branch labels, and dashed replies', async () => {
  const source =
    'sequenceDiagram\n participant A as CLI\n participant B as Registry\n A->>B: Request\n alt Found\n B-->>A: Result\n else Missing\n B-->>A: Empty\n end';
  const output = await draw(source);
  ['CLI', 'Registry', 'Request', 'alt', 'Found', 'else', 'Missing', 'Result', 'Empty'].forEach(
    (label) => {
      expect(output).toContain(label);
    },
  );
  expect(output).toContain('╌');
  expect(output).toContain('◀');
});

test('renders nested states and their transition labels', async () => {
  const source =
    'stateDiagram-v2\n [*] --> Active\n state Active {\n [*] --> Ready\n Ready --> Done: save\n }\n Active --> [*]';
  const output = await draw(source);
  ['Active', 'Ready', 'Done', 'save'].forEach((label) => expect(output).toContain(label));
  expect(output).toContain('│');
});

test('uses ASCII drawing glyphs when requested', async () => {
  const output = await draw('flowchart TD\n A[Start] --> B[Finish]', true);
  expect(output).toContain('Start');
  expect(output).toContain('Finish');
  expect(output).not.toMatch(/[\u2500-\u257f]/u);
  expect(output).toContain('+');
});

test('reserves three complete rows for an empty self-message before the next caption', async () => {
  const output = await draw('sequenceDiagram\n A->>A: \n A->>B: Next');
  const lines = output.split('\n');
  const start = lines.findIndex((line) => line.includes('├──┐'));
  expect(start).toBeGreaterThanOrEqual(0);
  expect(lines[start + 1]).toMatch(/│ {2}│/u);
  expect(lines[start + 2]).toContain('◀──┘');
  expect(lines.findIndex((line) => line.includes('Next'))).toBeGreaterThan(start + 2);
});

test('rejects an oversized participant header before calling Ink', async () => {
  const diagram = await Effect.runPromise(renderMermaid('sequenceDiagram\n A->>B: Hi'));
  const label = diagram.svg.querySelector('[data-et="participant"] text');
  expect(label).not.toBeNull();
  label!.textContent = 'A'.repeat(40_000);
  const render = vi.mocked(ink.renderToString).mockClear();
  await expect(Effect.runPromise(renderSequence(diagram, options))).rejects.toThrow(
    'Sequence is too large to render.',
  );
  expect(render).not.toHaveBeenCalled();
});
