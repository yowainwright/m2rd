import { describe, expect, test } from 'vitest';
import { APP_INITIAL_CONTEXT, DEFAULT_SOURCE } from '@/app/constants';
import { DEFAULT_CANVAS_SETTINGS, DEFAULT_SETTINGS } from '@/app/graph/constants';
import {
  getSelectionLabel,
  resetWorkspace,
  acceptRenderedElements,
  restoreWorkspace,
  shouldRerenderWorkspace,
  updateNodeChanges,
  updateEdgeChanges,
} from '@/app/utils';
import { applySettings, parseMermaidSvg } from '@/app/graph';
import type { GraphElements } from '@/app/graph';

const sequenceSvg = `<svg viewBox="0 0 450 306">
  <g data-et="participant" data-id="A"><rect class="actor-top" x="0" width="150" /><text>Alice</text></g>
  <g data-et="participant" data-id="B"><rect class="actor-top" x="200" width="150" /><text>Bob</text></g>
  <text class="messageText">Hello</text>
  <line data-et="message" data-id="i0" x1="75" x2="275" y1="115" marker-end="url(#arrowhead)" />
  <rect class="rect" x="50" y="80" width="250" height="120" fill="transparent" />
  <g data-et="control-structure" data-id="alt">
    <line class="loopLine" x1="60" x2="290" y1="90" y2="190" />
    <text class="labelText">alt</text><text class="loopText">[Approved]</text>
  </g>
  <g data-et="note" data-id="n0"><rect class="note" x="300" y="100" width="100" height="40" /><text class="noteText">Note</text></g>
</svg>`;

const createElements = () => parseMermaidSvg(sequenceSvg, DEFAULT_SETTINGS, 'sequence');

const createTranslation = (elements: GraphElements) =>
  Object.assign({}, APP_INITIAL_CONTEXT.translation, {
    diagramType: 'sequence' as const,
    elements,
  });

const createRecords = (elements: GraphElements) => ({
  input: APP_INITIAL_CONTEXT.input,
  translation: createTranslation(elements),
  versions: [],
  workspace: APP_INITIAL_CONTEXT.workspace,
});

test('allows Gantt selection and measurements while rejecting schedule mutations', () => {
  const task = { id: 'task', data: { kind: 'gantt-task' }, position: { x: 50, y: 20 } };
  const frame = { id: 'frame', data: { kind: 'gantt-frame' }, position: { x: 0, y: 0 } };
  const elements = { nodes: [frame, task], edges: [] };
  const translation = Object.assign({}, APP_INITIAL_CONTEXT.translation, {
    diagramType: 'gantt' as const,
    elements,
  });
  const context = Object.assign({}, APP_INITIAL_CONTEXT, { translation });
  const changed = updateNodeChanges(context, {
    type: 'nodes.update',
    changes: [
      { type: 'position', id: 'task', position: { x: 999, y: 999 } },
      { type: 'remove', id: 'task' },
      { type: 'add', item: { id: 'extra', data: {}, position: { x: 0, y: 0 } } },
      { type: 'select', id: 'frame', selected: true },
      { type: 'select', id: 'task', selected: true },
      { type: 'dimensions', id: 'task', dimensions: { width: 100, height: 20 } },
    ],
  });
  expect(changed.translation.elements.nodes).toHaveLength(2);
  expect(changed.translation.elements.nodes[0]).toEqual(frame);
  expect(changed.translation.elements.nodes[1]).toMatchObject({
    position: task.position,
    selected: true,
    width: 100,
    height: 20,
  });
  const edges = updateEdgeChanges(context, {
    type: 'edges.update',
    changes: [{ type: 'add', item: { id: 'edge', source: 'task', target: 'frame' } }],
  });
  expect(edges.translation.elements.edges).toEqual([]);
});

describe('workspace defaults', () => {
  test.each([
    [0, 0, 'Global'],
    [1, 0, '1 node'],
    [0, 1, '1 edge'],
    [2, 0, '2 nodes'],
    [0, 3, '3 edges'],
    [1, 1, '1 node, 1 edge'],
    [2, 3, '2 nodes, 3 edges'],
  ] as const)('labels %i nodes and %i edges as %s', (nodes, edges, label) => {
    expect(getSelectionLabel(nodes, edges)).toBe(label);
  });

  test('creates an isolated draft with fresh default state', () => {
    const context = Object.assign({}, APP_INITIAL_CONTEXT, {
      canvasRevision: 4,
    });
    const draft = resetWorkspace(context);

    expect(draft.workspace.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(draft.workspace.id).toBe(draft.input.workspaceId);
    expect(draft.workspace.id).not.toBe(APP_INITIAL_CONTEXT.workspace.id);
    expect(draft.input.source).toBe(DEFAULT_SOURCE);
    expect(draft.input.source).toMatch(/^sequenceDiagram\n/);
    expect(draft.translation.diagramType).toBe('sequence');
    expect(draft.translation.elements).toEqual({ nodes: [], edges: [] });
    expect(draft.translation.elements).not.toBe(APP_INITIAL_CONTEXT.translation.elements);
    expect(draft.translation.settings).toEqual(DEFAULT_SETTINGS);
    expect(draft.translation.settings).not.toBe(APP_INITIAL_CONTEXT.translation.settings);
    expect(draft.translation.view.canvas).toEqual(DEFAULT_CANVAS_SETTINGS);
    expect(draft.translation.view.canvas).not.toBe(APP_INITIAL_CONTEXT.translation.view.canvas);
  });
});

const acceptingSequenceRendersCases = {
  'keeps fresh message data while restoring edge color, width, and animation': () => {
    const edited = applySettings(createElements(), {
      edgeColor: '#123456',
      edgeWidth: 5,
      edgeAnimation: 'surge',
      edgeType: 'straight',
    });
    const changedSvg = sequenceSvg
      .replace('data-id="i0"', 'data-id="i0" class="messageLine1"')
      .replace('y1="115"', 'y1="160"')
      .replace('>Hello<', '>Reply<')
      .replace(
        '<line data-et="message"',
        '<text class="sequenceNumber">7</text><line data-et="message"',
      );
    const fresh = parseMermaidSvg(changedSvg, DEFAULT_SETTINGS, 'sequence');
    const context = Object.assign({}, APP_INITIAL_CONTEXT, {
      translation: createTranslation(edited),
    });
    const result = acceptRenderedElements(context, { diagramType: 'sequence', elements: fresh });
    const [source, target] = result.translation.elements.edges;

    expect(source.data).toMatchObject({
      dashed: true,
      messageY: 160,
      sequenceNumber: '7',
      edgeType: 'straight',
    });
    expect(target.data).toMatchObject({ dashed: true, messageY: 160, segment: 'target' });
    expect(source.style).toMatchObject({ stroke: '#123456', strokeWidth: 5 });
    expect(source.type).toBe('surge');
    expect(
      result.translation.elements.nodes.find((node) => node.data.kind === 'sequence-action')?.data
        .label,
    ).toBe('Reply');
  },
  'accepts a rendered sequence without applying generic node fills': () => {
    const elements = createElements();
    const result = acceptRenderedElements(APP_INITIAL_CONTEXT, {
      diagramType: 'sequence',
      elements,
    });

    expect(result.translation.elements.nodes).toEqual(elements.nodes);
    expect(result).toMatchObject({ needsRender: false, resetLayout: false });
    expect(result.translation.diagramType).toBe('sequence');
  },
};

describe('accepting sequence renders', () => {
  Object.entries(acceptingSequenceRendersCases).forEach(([name, run]) => test(name, run));
});

describe('saved sequence upgrades', () => {
  test.each([{ handles: undefined }, { styleVersion: undefined }])(
    'requests a fresh layout for legacy participant data %j',
    (legacyData) => {
      const elements = createElements();
      const nodes = elements.nodes.map((node) =>
        Object.assign({}, node, {
          data: Object.assign({}, node.data, legacyData),
        }),
      );
      const records = createRecords({ nodes, edges: elements.edges });
      const restored = restoreWorkspace(APP_INITIAL_CONTEXT, records);

      expect(shouldRerenderWorkspace(records)).toBe(true);
      expect(restored).toMatchObject({ needsRender: true, resetLayout: true });
      expect(restored.canvasRevision).toBe(APP_INITIAL_CONTEXT.canvasRevision + 1);
    },
  );

  test('upgrades messages without action nodes', () => {
    const elements = createElements();
    const nodes = elements.nodes.filter((node) => node.data.kind !== 'sequence-action');

    expect(shouldRerenderWorkspace(createRecords({ nodes, edges: elements.edges }))).toBe(true);
  });

  test('does not request another upgrade for current sequence records', () => {
    const records = createRecords(createElements());

    expect(shouldRerenderWorkspace(records)).toBe(false);
    expect(restoreWorkspace(APP_INITIAL_CONTEXT, records)).toMatchObject({
      needsRender: false,
      resetLayout: false,
    });
  });
});
