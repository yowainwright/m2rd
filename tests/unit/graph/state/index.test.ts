import { describe, expect, test } from 'vitest';
import { createStateElements, readStateLayout } from '@/app/graph/state';
import { STATE_SHAPES } from '@/app/graph/state/constants';
import { DEFAULT_SETTINGS } from '@/app/graph/constants';
import { applySavedAppearance, applySettings } from '@/app/graph';
import { getStateSurface } from '@/app/components/diagrams/state';

const parent = {
  id: 'Active',
  domId: 'active',
  shape: 'roundedWithTitle',
  label: 'Active',
  x: 200,
  y: 200,
  width: 400,
  height: 400,
};
const state = {
  id: 'Ready',
  domId: 'ready',
  shape: 'roundedRect',
  label: 'Ready',
  parentId: 'Active',
  x: 100,
  y: 100,
  width: 100,
  height: 40,
};
const transition = {
  id: 'edge0',
  start: 'Ready',
  end: 'Ready',
  label: 'retry',
  arrowTypeEnd: 'arrow_barb',
  points: [
    { x: 150, y: 94 },
    { x: 180, y: 94 },
    { x: 180, y: 106 },
    { x: 150, y: 106 },
  ],
};
const layout = { nodes: [state, parent], edges: [transition] };
const create = (value: unknown = layout) =>
  createStateElements(readStateLayout(value), DEFAULT_SETTINGS);

const stateDiagramAdapterCases = {
  'uses IDs safe for React Flow attribute selectors': () => {
    const result = create();
    const ids = result.nodes.map((node) => node.id).concat(result.edges.map((edge) => edge.id));
    ids.forEach((id) => {
      expect(() => document.querySelector(`[data-id="${id}"]`)).not.toThrow();
    });
  },
  'keeps transition IDs stable when unrelated transitions are inserted': () => {
    const extra = Object.assign({}, transition, { start: 'Active', end: 'Ready' });
    const next = create({ nodes: layout.nodes, edges: [extra, transition, transition] });
    expect(next.edges[1].id).toBe(create().edges[0].id);
    expect(next.edges[2].id).not.toBe(next.edges[1].id);
  },
  'orders parents first and converts absolute coordinates to parent-relative positions': () => {
    const result = create();
    expect(result.nodes[0].data.shape).toBe('roundedWithTitle');
    expect(result.nodes[1]).toMatchObject({
      parentId: result.nodes[0].id,
      position: { x: 50, y: 80 },
      extent: 'parent',
    });
    const [edge] = result.edges;
    expect(edge.source).toBe(edge.target);
    expect(result.nodes[1].data.handles).toHaveLength(2);
    expect(edge.label).toBe('retry');
    expect(edge.data.points).toEqual(transition.points);
  },
  'keeps concurrent-region and terminal IDs stable when Mermaid generates new IDs': () => {
    const concurrent = (id: string) => ({
      nodes: [
        parent,
        Object.assign({}, parent, { id, shape: 'divider', parentId: 'Active' }),
        Object.assign({}, parent, { id: `${id}-second`, shape: 'divider', parentId: 'Active' }),
        Object.assign({}, state, { id: `${id}_start`, shape: 'stateStart', parentId: id }),
      ],
      edges: [],
    });
    const first = create(concurrent('random-1'));
    const next = create(concurrent('random-2'));
    expect(next.nodes.map((node) => node.id)).toEqual(first.nodes.map((node) => node.id));
    expect(new Set(next.nodes.map((node) => node.id)).size).toBe(next.nodes.length);
  },
  'rejects notes without an association': () => {
    const note = Object.assign({}, state, { id: 'note', shape: 'note' });
    expect(() => create({ nodes: [parent, note], edges: [] })).toThrow('incompatible');
  },
  'preserves notes, text, and dashed arrowless associations': () => {
    const note = Object.assign({}, state, {
      id: 'note-1',
      shape: 'note',
      label: 'First<br/>Second',
    });
    const association = Object.assign({}, transition, {
      end: note.id,
      arrowTypeEnd: '',
      pattern: 'dashed',
      label: '',
    });
    const result = create({ nodes: [parent, state, note], edges: [association] });
    expect(result.nodes[2].data.label).toBe('First\nSecond');
    expect(result.edges[0].data).toMatchObject({ arrow: false, dashed: true });
    expect(result.edges[0].markerEnd).toBeUndefined();
    const edited = applySettings(result, {
      edgeMarker: 'arrow',
      edgeAnimation: 'surge',
      edgeType: 'straight',
    });
    expect(edited.edges[0].markerEnd).toBeUndefined();
    expect(edited.edges[0].type).toBe('stateTransition');
  },
  'keeps state geometry and markers when global shape settings change': () => {
    const initial = create();
    const edited = applySettings(initial, {
      nodeShape: 'diamond',
      edgeMarker: 'none',
      edgeColor: '#123456',
    });
    expect(edited.nodes[1].style).toEqual(initial.nodes[1].style);
    expect(getStateSurface(edited.nodes[1].data).clipPath).toBeUndefined();
    expect(edited.edges[0].markerEnd).toEqual({ type: 'arrowclosed', color: '#123456' });
  },
  'restores appearance without restoring stale labels, routes, or hierarchy': () => {
    const saved = applySettings(create(), { primaryColor: '#abcdef', edgeColor: '#123456' });
    saved.nodes[1].position = { x: 70, y: 90 };
    const fresh = create({
      nodes: [Object.assign({}, state, { label: 'Changed', parentId: undefined })],
      edges: [
        Object.assign({}, transition, {
          label: 'new',
          points: [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
          ],
        }),
      ],
    });
    const restored = applySavedAppearance(fresh, saved);
    expect(restored.nodes[0].data.label).toBe('Changed');
    expect(restored.nodes[0].parentId).toBeUndefined();
    expect(restored.nodes[0].position).toEqual(fresh.nodes[0].position);
    expect(restored.edges[0].data.points).toEqual(fresh.edges[0].data.points);
    expect(restored.edges[0].label).toBe('new');
    expect(restored.edges[0].style?.stroke).toBe('#123456');
  },
  'rejects parent cycles': () => {
    expect(() =>
      create({ nodes: [Object.assign({}, parent, { parentId: 'Active' })], edges: [] }),
    ).toThrow('incompatible');
  },
};

describe('state diagram adapter', () => {
  test.each(STATE_SHAPES.filter((shape) => shape !== 'note'))(
    'preserves the %s symbol',
    (shape) => {
      const result = create({ nodes: [Object.assign({}, parent, { shape })], edges: [] });
      expect(result.nodes[0].data.shape).toBe(shape);
    },
  );
  test.each([
    { nodes: [{ id: 'missing geometry' }], edges: [] },
    { nodes: [Object.assign({}, parent, { x: NaN })], edges: [] },
    { nodes: [parent], edges: [transition] },
    { nodes: [state], edges: [] },
    { nodes: [parent, parent], edges: [] },
  ])('rejects incompatible data instead of guessing', (value) => {
    expect(() => readStateLayout(value)).toThrow('incompatible');
  });
  Object.entries(stateDiagramAdapterCases).forEach(([name, run]) => test(name, run));
});
