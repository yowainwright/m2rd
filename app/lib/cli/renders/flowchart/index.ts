import { createElement } from 'react';
import { Box, Text, renderToString } from 'ink';
import { Array as EffectArray, Effect, Result } from 'effect';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkPoint, ElkEdgeSection, ElkNode, ElkExtendedEdge } from 'elkjs';
import { UnicodeContext } from '@/app/hooks/useUnicode';
import { MAX_RENDER_CELLS } from '../../constants';
import { errorMessage } from '../../utils';
import type { CliOptions, RenderedMermaid } from '../../types';
import { LINE_GLYPHS, NODE_COLORS } from './constants';
import { createNodePanel, createLayoutInput, readFlowchart } from './utils';
import { Panel } from '@/app/components/ui/panel';
import type { FlowGraph, PanelNode, TerminalLayout } from './types';

const cellKey = ({ x, y }: ElkPoint) => `${x},${y}`;
const cellPoint = ({ x, y }: ElkPoint): ElkPoint => ({ x: Math.round(x), y: Math.round(y) });

const addConnection = (cells: Map<string, number>, point: ElkPoint, direction: number) => {
  const key = cellKey(point);
  const connected = (cells.get(key) ?? 0) | direction;
  cells.set(key, connected);
};

const paintSegment = (cells: Map<string, number>, start: ElkPoint, end: ElkPoint) => {
  const dx = Math.sign(end.x - start.x);
  const dy = Math.sign(end.y - start.y);
  const diagonal = dx !== 0 && dy !== 0;
  if (diagonal) throw new Error('ELK returned a non-orthogonal connector.');
  const distance = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
  const horizontal = dx > 0 ? [2, 8] : [8, 2];
  const vertical = dy > 0 ? [4, 1] : [1, 4];
  const [forward, backward] = dx ? horizontal : vertical;
  Array.from({ length: distance }, (_, step) => {
    const x = start.x + dx * step;
    const y = start.y + dy * step;
    const point = { x, y };
    const next = { x: point.x + dx, y: point.y + dy };
    addConnection(cells, point, forward);
    addConnection(cells, next, backward);
  });
};

const paintSection = (cells: Map<string, number>, section: ElkEdgeSection) => {
  const endPoint = { x: section.endPoint.x, y: section.endPoint.y - 1 };
  const points = [section.startPoint].concat(section.bendPoints ?? [], [endPoint]).map(cellPoint);
  points.slice(1).forEach((point, index) => paintSegment(cells, points[index], point));
  return cellPoint(endPoint);
};

const lineGlyph = (mask: number, ascii: boolean) => {
  if (!ascii) return LINE_GLYPHS[mask] ?? ' ';
  if (!mask) return ' ';
  const horizontal = (mask & 10) !== 0;
  const vertical = (mask & 5) !== 0;
  const crossing = horizontal && vertical;
  if (crossing) return '+';
  return horizontal ? '-' : '|';
};

const edgeSections = (edge: ElkExtendedEdge) =>
  (edge.sections ?? []).map((section) => ({ id: edge.id, section }));

const frameBorderMask = (node: PanelNode, x: number, y: number) => {
  const left = Math.round(node.x ?? 0);
  const top = Math.round(node.y ?? 0);
  const right = left + Math.round(node.width) - 1;
  const bottom = top + Math.round(node.height) - 1;
  const side = x === left || x === right;
  const cap = y === top || y === bottom;
  const insideY = y > top && y < bottom;
  const insideX = x > left && x < right;
  const vertical = side && insideY;
  const horizontal = cap && insideX;
  if (vertical) return 5;
  if (horizontal) return 10;
  return 0;
};

const connectorText = (layout: TerminalLayout, graph: FlowGraph, ascii: boolean) => {
  const cells = new Map<string, number>();
  const arrows = new Set<string>();
  const arrowEdges = new Set(graph.edges.filter((edge) => edge.arrow).map((edge) => edge.id));
  const frames = layout.children.filter((node) => node.frame);
  const sections = layout.edges.flatMap(edgeSections);
  sections.forEach(({ id, section }) => {
    const tip = paintSection(cells, section);
    if (arrowEdges.has(id)) arrows.add(cellKey(tip));
  });
  const glyph = (x: number, y: number) => {
    const key = cellKey({ x, y });
    if (arrows.has(key)) return ascii ? 'v' : '▼';
    const mask = cells.get(key) ?? 0;
    if (!mask) return ' ';
    const borders = frames.map((frame) => frameBorderMask(frame, x, y));
    const combined = borders.reduce((value, border) => value | border, mask);
    return lineGlyph(combined, ascii);
  };
  const row = (y: number) =>
    Array.from({ length: Math.ceil(layout.width) }, (_, x) => glyph(x, y)).join('');
  return Array.from({ length: Math.ceil(layout.height) }, (_, y) => row(y)).join('\n');
};

const positionedPanel = (node: PanelNode, ascii: boolean) => {
  const top = Math.round(node.y ?? 0);
  const left = Math.round(node.x ?? 0);
  const panel = node.frame ? framePanel(node, ascii) : createNodePanel(node, node.width, ascii);
  return createElement(
    Box,
    { key: node.id, position: 'absolute', top, left, width: node.width },
    panel,
  );
};

const framePanel = (node: PanelNode, ascii: boolean) => {
  const borderStyle = ascii ? 'classic' : 'single';
  const label = createElement(Text, { bold: true, color: 'yellow' }, node.label);
  return createElement(
    Panel,
    { width: node.width, height: node.height, borderColor: 'yellow', borderStyle },
    label,
  );
};

const portJunction = (node: PanelNode, side: 'in' | 'out', ascii: boolean) => {
  const port = node.ports?.find((port) => port.id === `${node.id}:${side}`);
  if (!port) return null;
  const incoming = side === 'in';
  const single = incoming ? '┴' : '┬';
  const double = incoming ? '╧' : '╤';
  const unicode = node.decision ? double : single;
  const glyph = ascii ? '+' : unicode;
  const left = Math.round((node.x ?? 0) + (port.x ?? 0));
  const top = Math.round(node.y ?? 0) + (incoming ? 0 : Math.round(node.height) - 1);
  const accented = node.decision || node.frame;
  const color = accented ? NODE_COLORS.decision : NODE_COLORS.default;
  const text = createElement(Text, { color }, glyph);
  const key = `junction-${node.id}-${side}`;
  return createElement(Box, { key, position: 'absolute', top, left }, text);
};

const portJunctions = (layout: TerminalLayout, graph: FlowGraph, ascii: boolean) => {
  const sources = new Set(graph.edges.map((edge) => edge.source));
  const targets = new Set(graph.edges.map((edge) => edge.target));
  return layout.children.flatMap((node) => {
    const source = sources.has(node.id) ? portJunction(node, 'out', ascii) : null;
    const target = targets.has(node.id) ? portJunction(node, 'in', ascii) : null;
    return [source, target];
  });
};

const positionedLabels = (edge: ElkExtendedEdge) =>
  (edge.labels ?? []).map((label, index) => {
    const top = Math.round(label.y ?? 0);
    const left = Math.round(label.x ?? 0);
    const text = createElement(Text, { wrap: 'truncate' }, label.text);
    const key = `${edge.id}:label:${index}`;
    return createElement(
      Box,
      { key, position: 'absolute', top, left, width: label.width, height: 1 },
      text,
    );
  });

const connectorElements = (layout: TerminalLayout, graph: FlowGraph, ascii: boolean) => {
  const lines = connectorText(layout, graph, ascii).split('\n');
  return lines.flatMap((line, top) =>
    Array.from(line.matchAll(/\S+/gu), (match) => {
      const left = match.index;
      const key = `route-${top}-${left}`;
      const text = createElement(Text, null, match[0]);
      return createElement(Box, { key, position: 'absolute', top, left }, text);
    }),
  );
};

const drawFlowchart = (layout: TerminalLayout, graph: FlowGraph, options: CliOptions) => {
  const width = Math.ceil(layout.width);
  const height = Math.ceil(layout.height);
  const [nodeLayouts, frameLayouts] = EffectArray.partition(layout.children, (node) =>
    node.frame ? Result.fail(node) : Result.succeed(node),
  );
  const frames = frameLayouts.map((node) => positionedPanel(node, options.ascii));
  const nodes = nodeLayouts.map((node) => positionedPanel(node, options.ascii));
  const connections = connectorElements(layout, graph, options.ascii);
  const children = frames.concat(connections, nodes, layout.edges.flatMap(positionedLabels));
  const junctions = portJunctions(layout, graph, options.ascii);
  const canvas = createElement(Box, { position: 'relative', width, height }, children, junctions);
  const value = { unicode: !options.ascii };
  const tree = createElement(UnicodeContext.Provider, { value }, canvas);
  return renderToString(tree, { columns: width });
};

const validateLayout = (layout: TerminalLayout) => {
  const finite = Number.isFinite(layout.width) && Number.isFinite(layout.height);
  const area = layout.width * layout.height;
  const valid = finite && area > 0 && area <= MAX_RENDER_CELLS;
  if (!valid) throw new Error('The terminal layout is empty or too large to render.');
};

const absoluteNodes = (nodes: ElkNode[], x = 0, y = 0): ElkNode[] =>
  nodes.flatMap((node) => {
    const left = x + (node.x ?? 0);
    const top = y + (node.y ?? 0);
    const positioned: ElkNode = Object.assign({}, node, { x: left, y: top });
    return [positioned].concat(absoluteNodes(node.children ?? [], left, top));
  });

const offsetSection = (section: ElkEdgeSection, x: number, y: number) => {
  const shift = (point: ElkPoint): ElkPoint => ({ x: point.x + x, y: point.y + y });
  const startPoint = shift(section.startPoint);
  const endPoint = shift(section.endPoint);
  const bendPoints = section.bendPoints?.map(shift);
  return Object.assign({}, section, { startPoint, endPoint, bendPoints });
};

const offsetEdge = (edge: ElkExtendedEdge, x: number, y: number): ElkExtendedEdge => {
  const sections = edge.sections?.map((section) => offsetSection(section, x, y));
  const labels = edge.labels?.map((label) => {
    const left = (label.x ?? 0) + x;
    const top = (label.y ?? 0) + y;
    const position = { x: left, y: top };
    return Object.assign({}, label, position);
  });
  return Object.assign({}, edge, { sections, labels });
};

const containerEdges = (node: ElkNode) =>
  (node.edges ?? []).map((edge) => offsetEdge(edge, node.x ?? 0, node.y ?? 0));

const readLayout = (layout: ElkNode, graph: FlowGraph): TerminalLayout => {
  const originals = new Map(graph.nodes.map((node) => [node.id, node]));
  const positioned = absoluteNodes(layout.children ?? []);
  const children = positioned.map((node): PanelNode => {
    const source = originals.get(node.id);
    if (!source) throw new Error(`Unknown ELK node ${node.id}.`);
    const width = node.width ?? 0;
    const height = node.height ?? 0;
    const positioned = Number.isFinite(node.x) && Number.isFinite(node.y);
    const finite = Number.isFinite(width) && Number.isFinite(height);
    const positive = width > 0 && height > 0;
    const sized = finite && positive;
    const valid = positioned && sized;
    if (!valid) throw new Error(`ELK did not position state or node ${node.id}.`);
    return Object.assign({}, node, source, { width, height });
  });
  const containers = [layout].concat(positioned);
  const edges = containers.flatMap(containerEdges);
  const width = layout.width ?? 0;
  const height = layout.height ?? 0;
  return { id: layout.id, children, edges, width, height };
};

const layoutFlowchart = async (graph: FlowGraph, options: CliOptions) => {
  const input = createLayoutInput(graph, options);
  const elk = new ELK();
  const result = await elk.layout(input);
  const layout = readLayout(result, graph);
  validateLayout(layout);
  return drawFlowchart(layout, graph, options);
};

export const renderBoxGraph = (graph: FlowGraph, options: CliOptions) =>
  Effect.tryPromise({ try: () => layoutFlowchart(graph, options), catch: errorMessage });

export const renderFlowchart = (diagram: RenderedMermaid, options: CliOptions) => {
  const graph = Effect.try({ try: () => readFlowchart(diagram), catch: errorMessage });
  return graph.pipe(Effect.flatMap((value) => renderBoxGraph(value, options)));
};
