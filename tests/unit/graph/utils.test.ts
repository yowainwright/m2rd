import { describe, expect, test } from 'vitest';
import { APP_INITIAL_CONTEXT } from '@/app/constants';
import { DEFAULT_CANVAS_SETTINGS, DEFAULT_SETTINGS } from '@/app/graph/constants';
import {
  createNodeStyle,
  getNodeGradientValue,
  getNodeShapeValue,
  getTranslation,
  updateSelectedNodes,
  applySavedAppearance,
  applySettings,
  getEdgeMarkerValue,
  getNodeBorderValue,
  getNodeFillValue,
  getNodeSurfaceValue,
  getNodeTextValue,
  parseMermaidSvg,
  updateSelectedEdges,
} from '@/app/graph';
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

const ganttNode = {
  id: 'gantt:build',
  type: 'ganttTask',
  position: { x: 100, y: 50 },
  style: { width: 150, height: 20 },
  data: { kind: 'gantt-task', status: 'done', style: {}, parts: [{ text: 'Build' }] },
};

test.each([false, true])('Gantt keeps fresh dates and geometry with resetLayout=%s', (reset) => {
  const saved = Object.assign({}, ganttNode, {
    selected: true,
    position: { x: 999, y: 999 },
    style: { width: 999, height: 999 },
    data: Object.assign({}, ganttNode.data, { style: { backgroundColor: '#123456' }, parts: [] }),
  });
  const restored = applySavedAppearance(
    { nodes: [ganttNode], edges: [] },
    { nodes: [saved], edges: [] },
    reset,
  ).nodes[0];
  expect(restored.position).toEqual(ganttNode.position);
  expect(restored.style).toEqual(ganttNode.style);
  expect(restored.data.parts).toEqual(ganttNode.data.parts);
  expect(restored.data.style.backgroundColor).toBe('#123456');
  expect(restored.selected).toBe(true);
});

test.each([{ ambiguousIdentity: true }, { status: 'crit' }])(
  'does not transfer stale appearance across ambiguous identity or status changes %j',
  (data) => {
    const changed = Object.assign({}, ganttNode, { data: Object.assign({}, ganttNode.data, data) });
    const saved = updateSelectedNodes({ nodes: [ganttNode], edges: [] }, [ganttNode.id], {
      primaryColor: '#123456',
    });
    const restored = applySavedAppearance({ nodes: [changed], edges: [] }, saved);
    expect(restored.nodes[0].data.style).toEqual({});
  },
);

test('hydrates Gantt appearance without adding default fills to decorations', () => {
  const frame = Object.assign({}, ganttNode, {
    id: 'gantt:frame',
    data: { kind: 'gantt-frame', style: {} },
  });
  const elements = applySettings(
    { nodes: [frame, ganttNode], edges: [] },
    { primaryColor: '#123456' },
  );
  const translation = Object.assign({}, APP_INITIAL_CONTEXT.translation, {
    diagramType: 'gantt' as const,
    elements,
  });
  const hydrated = getTranslation(translation);
  expect(hydrated.elements.nodes[0].data.style).toEqual({});
  expect(hydrated.elements.nodes[1].data.style.backgroundColor).toBe('#123456');
  expect(hydrated.elements.nodes[1].style).toEqual(ganttNode.style);
});

const nodeAppearanceDefaultsCases = {
  'keeps vertical and rectangle node overrides after hydration with different global defaults':
    () => {
      const nodeGradient = Object.assign({}, DEFAULT_SETTINGS.nodeGradient, {
        direction: 'horizontal' as const,
      });
      const settings = Object.assign({}, DEFAULT_SETTINGS, {
        nodeGradient,
        nodeShape: 'circle' as const,
      });
      const node = {
        id: 'A',
        data: { label: 'A' },
        position: { x: 0, y: 0 },
        style: createNodeStyle(settings),
      };
      const elements = updateSelectedNodes({ nodes: [node], edges: [] }, ['A'], {
        nodeGradient: DEFAULT_SETTINGS.nodeGradient,
        nodeShape: 'rectangle',
      });
      const translation = Object.assign({}, APP_INITIAL_CONTEXT.translation, {
        elements,
        settings,
      });
      const hydrated = getTranslation(translation);
      const [selected] = hydrated.elements.nodes;

      expect(getNodeGradientValue(selected, hydrated.settings).direction).toBe('vertical');
      expect(getNodeShapeValue(selected, hydrated.settings)).toBe('rectangle');
    },
  'uses neutral solid nodes and no canvas background': () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      inverseColor: '#171717',
      nodeSurface: 'solid',
      primaryColor: '#cccccc',
    });
    expect(DEFAULT_CANVAS_SETTINGS).toMatchObject({
      background: 'none',
      gridVisible: false,
    });

    const style = createNodeStyle(DEFAULT_SETTINGS);

    expect(style).toMatchObject({
      backgroundColor: '#cccccc',
      backgroundImage: 'none',
      color: '#171717',
    });
  },
};

describe('node appearance defaults', () => {
  Object.entries(nodeAppearanceDefaultsCases).forEach(([name, run]) => test(name, run));
});

const sequenceAppearanceCases = {
  'removes and restores both bidirectional markers globally without adding an arrow to the action':
    () => {
      const svg = sequenceSvg.replace('marker-end=', 'marker-start="url(#arrowhead)" marker-end=');
      const original = parseMermaidSvg(svg, DEFAULT_SETTINGS, 'sequence');
      const removed = applySettings(original, { edgeMarker: 'none' });
      expect(removed.edges.every((edge) => !edge.markerStart && !edge.markerEnd)).toBe(true);
      const [source, target] = applySettings(removed, { edgeMarker: 'arrow' }).edges;
      expect(source.markerStart).toEqual({ type: 'arrow', color: DEFAULT_SETTINGS.edgeColor });
      expect(source.markerEnd).toBeUndefined();
      expect(target.markerStart).toBeUndefined();
      expect(target.markerEnd).toEqual({ type: 'arrow', color: DEFAULT_SETTINGS.edgeColor });
    },
  'refreshes arrow direction from Mermaid while retaining saved edge color': () => {
    const original = applySettings(createElements(), { edgeColor: '#123456' });
    const svg = sequenceSvg.replace('marker-end=', 'marker-start=');
    const fresh = parseMermaidSvg(svg, DEFAULT_SETTINGS, 'sequence');
    const [source, target] = applySavedAppearance(fresh, original).edges;

    expect(source.markerStart).toEqual({ type: 'arrowclosed', color: '#123456' });
    expect(source.data.markerStart).toBe(true);
    expect(target.markerEnd).toBeUndefined();
    expect(target.data.markerEnd).toBe(false);
  },
  'edits only the selected action without changing geometry or connections': () => {
    const elements = createElements();
    const before = structuredClone(elements);
    const edited = updateSelectedNodes(elements, ['action-message-i0'], {
      primaryColor: '#123456',
    });
    const action = edited.nodes.find((node) => node.id === 'action-message-i0');
    const original = elements.nodes.find((node) => node.id === action?.id);

    expect(action?.data.style.backgroundColor).toBe('#123456');
    expect(action?.style).toEqual(original?.style);
    expect(action?.position).toEqual(original?.position);
    expect(edited.edges).toBe(elements.edges);
    expect(edited.nodes.filter((node) => node.id !== action?.id)).toEqual(
      elements.nodes.filter((node) => node.id !== action?.id),
    );
    expect(elements).toEqual(before);
  },
  'removes legacy generated defaults but preserves custom colors without mutating the saved record':
    () => {
      const elements = createElements();
      const style = Object.assign({}, createNodeStyle(DEFAULT_SETTINGS), { color: '#123456' });
      const nodes = elements.nodes.map((node) =>
        Object.assign({}, node, {
          data: Object.assign({}, node.data, { style, styleVersion: undefined }),
        }),
      );
      const saved = createTranslation({ nodes, edges: elements.edges });
      const before = structuredClone(saved);
      const hydrated = getTranslation(saved);

      hydrated.elements.nodes.forEach((node) => {
        expect(node.data.style).toEqual({ color: '#123456' });
        expect(node.data.styleVersion).toBe(1);
      });
      expect(saved).toEqual(before);
    },
};

const expectSelectedMarker = (edgeMarker: 'none' | 'arrow' | 'arrowclosed') => {
  const svg = sequenceSvg.replace('marker-end=', 'marker-start="url(#arrowhead)" marker-end=');
  const original = parseMermaidSvg(svg, DEFAULT_SETTINGS, 'sequence');
  const edited = updateSelectedEdges(original, ['message-i0-source'], { edgeMarker });
  const recolored = updateSelectedEdges(edited, ['message-i0-source'], {
    edgeColor: '#123456',
  });
  const [source, target] = recolored.edges;

  expect(getEdgeMarkerValue(source, DEFAULT_SETTINGS)).toBe(edgeMarker);
  expect(source.markerEnd).toBeUndefined();
  expect(target).toEqual(original.edges[1]);
  if (edgeMarker === 'none') {
    expect(source.markerStart).toBeUndefined();
    return;
  }
  expect(source.markerStart).toEqual({ type: edgeMarker, color: '#123456' });
};

const expectSequenceRoleDefaults = (id: string, fill: string, border: string, surface: string) => {
  const node = createElements().nodes.find((item) => item.id === id);

  expect(node).toBeDefined();
  expect(node?.data.style).toEqual({});
  expect(node?.data.styleVersion).toBe(1);
  expect(getNodeFillValue(node, DEFAULT_SETTINGS)).toBe(fill);
  expect(getNodeBorderValue(node, DEFAULT_SETTINGS)).toBe(border);
  expect(getNodeSurfaceValue(node, DEFAULT_SETTINGS)).toBe(surface);
  expect(getNodeTextValue(node, DEFAULT_SETTINGS)).toBe('#111827');
};

const expectExplicitSequenceColor = (primaryColor: string) => {
  const edited = updateSelectedNodes(createElements(), ['A'], { primaryColor });
  const hydrated = getTranslation(createTranslation(edited));
  const restored = applySavedAppearance(createElements(), hydrated.elements);
  const node = restored.nodes.find((item) => item.id === 'A');

  expect(node?.data.style.backgroundColor).toBe(primaryColor);
  expect(node?.data.styleVersion).toBe(1);
  expect(getNodeFillValue(node, DEFAULT_SETTINGS)).toBe(primaryColor);
};

const expectSequenceStyleReset = (resetLayout: boolean) => {
  const fresh = createElements();
  const edited = updateSelectedNodes(fresh, ['A'], { primaryColor: '#123456' });
  const moved = edited.nodes.map((node) =>
    Object.assign({}, node, { position: { x: 999, y: 999 } }),
  );
  const restored = applySavedAppearance(fresh, { nodes: moved, edges: edited.edges }, resetLayout);
  const participant = restored.nodes.find((node) => node.id === 'A');
  const expectedPosition = resetLayout ? { x: 0, y: 0 } : { x: 999, y: 999 };

  expect(participant?.position).toEqual(expectedPosition);
  expect(participant?.data.style.backgroundColor).toBe('#123456');
};

describe('sequence appearance', () => {
  test.each(['none', 'arrow', 'arrowclosed'] as const)(
    'updates the selected start marker to %s and reports it in the toolkit',
    expectSelectedMarker,
  );
  test.each([
    ['A', '#f3f4f6', 'solid', 'solid'],
    ['action-message-i0', '#ffffff', 'none', 'solid'],
    ['note-n0', '#f9fafb', 'solid', 'solid'],
    ['frame-alt', '#ffffff', 'dashed', 'solid'],
    ['frame-rect-0', '#f9fafb', 'none', 'pattern-diagonal'],
  ])(
    'keeps role defaults for %s without baking them into saved styles',
    expectSequenceRoleDefaults,
  );
  test.each(['#123456', '#cccccc'])(
    'preserves an explicit %s override through hydration and rerender',
    expectExplicitSequenceColor,
  );
  test.each([false, true])(
    'preserves custom styles when resetLayout is %s',
    expectSequenceStyleReset,
  );
  Object.entries(sequenceAppearanceCases).forEach(([name, run]) => test(name, run));
});
