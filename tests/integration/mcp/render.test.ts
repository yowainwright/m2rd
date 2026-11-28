import { execFileSync, spawnSync } from 'node:child_process';
import { Effect } from 'effect';
import { JSDOM } from 'jsdom';
import { beforeAll, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/app/graph/constants';
import { encodeSnapshot } from '@/app/graph/snapshot';
import { renderDiagram } from '@/packages/cli/src/utils';

const renderEntry = 'packages/server/dist/render.mjs';
const timestamp = '2026-11-17T00:00:00.000Z';
const fixtures = [
  ['flowchart', 'flowchart LR\nA[Hello] --> B[World]', 'Hello'],
  ['sequence', 'sequenceDiagram\nAlice->>Bob: Hello', 'Alice'],
  ['stateDiagram', 'stateDiagram-v2\n[*] --> Idle\nIdle --> Active', 'Idle'],
  ['classDiagram', 'classDiagram\nclass Animal\nclass Dog\nAnimal <|-- Dog', 'Animal'],
  ['er', 'erDiagram\nCUSTOMER ||--o{ ORDER : places', 'CUSTOMER'],
  [
    'gantt',
    'gantt\n title Report\n dateFormat YYYY-MM-DD\n section Work\n Build :a1, 2026-11-17, 2d',
    'Build',
  ],
];

beforeAll(() => {
  const env = { ...process.env, npm_config_manage_package_manager_versions: 'false' };
  execFileSync('pnpm', ['run', 'server:build'], { env, stdio: 'pipe' });
});

it.each([false, true])('matches the CLI exactly for ascii=%s', async (ascii) => {
  const source = fixtures[0][1];
  const expected = await Effect.runPromise(renderDiagram(source, { ascii, width: 40 }));
  const job = { tool: 'text', source, ascii, width: 40 };
  expect(render(job)).toEqual({ text: expected });
});

it.each(fixtures)('packages a consistent %s graph and SVG', async (diagramType, source, label) => {
  const rendered = render({ tool: 'graph', source });
  expect(rendered.diagramType).toBe(diagramType);
  expect(rendered.elements.nodes.length).toBeGreaterThan(0);
  const { elements, svg } = rendered;
  expect(JSON.stringify(elements.nodes)).toContain(label);
  expect(svg).toContain(label);
  const records = makeRecords(source, { diagramType: rendered.diagramType, elements });
  const { window } = new JSDOM();
  const saveId = crypto.randomUUID();
  const envelope = await Effect.runPromise(
    encodeSnapshot({ records, svg, saveId, ordinal: 1 }, window),
  );
  expect(JSON.parse(envelope).records.input.source).toBe(source);
  window.close();
});

it('rejects invalid diagram input in a fresh process', () => {
  const job = { tool: 'text', source: 'not Mermaid' };
  expect(() => render(job)).toThrow();
});

const render = (job: object) => {
  const output = spawnSync(process.execPath, [renderEntry], {
    input: JSON.stringify(job),
    encoding: 'utf8',
    timeout: 10_000,
    env: { NODE_ENV: 'development' },
  });
  if (output.status !== 0) throw new Error(output.stderr || 'Rendering failed.');
  return JSON.parse(output.stdout);
};

const makeRecords = (
  source: string,
  rendered: Pick<import('@/app/graph').GraphTranslation, 'diagramType' | 'elements'>,
) => ({
  input: {
    source,
    format: 'mermaid' as const,
    id: 'input',
    workspaceId: 'workspace',
    updatedAt: timestamp,
    version: 1,
  },
  translation: {
    ...rendered,
    id: 'trans',
    inputId: 'input',
    updatedAt: timestamp,
    error: null,
    view: {},
    settings: DEFAULT_SETTINGS,
  },
  workspace: {
    id: 'workspace',
    name: 'Fixture',
    activeInputId: 'input',
    activeTranslationId: 'trans',
    updatedAt: timestamp,
  },
});
