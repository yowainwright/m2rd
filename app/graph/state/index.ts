import type { StateNodeOptions } from './types';
import { Array as EffectArray, Schema } from 'effect';
import mermaid from 'mermaid';
import mermaidMetadata from 'mermaid/package.json';
import { MarkerType, Position, type Edge, type Node } from 'reactflow';
import { GraphRenderError, type GraphElements, type TranslationSettings } from '../types';
import { createEdgeStyle, createNodeStyle } from '../utils';
import {
  STATE_COMPATIBILITY_ERROR,
  STATE_EDGE_TYPE,
  STATE_NODE_TYPE,
  StateLayoutSchema,
} from './constants';
import type {
  StateEdgeData,
  StateHandle,
  StateLayout,
  StateLayoutEdge,
  StateLayoutNode,
  StateNodeData,
  StatePoint,
} from './types';

export const stateCompatibilityError = () =>
  new GraphRenderError('unsupported', STATE_COMPATIBILITY_ERROR, 'stateDiagram');

export const readStateLayout = (value: unknown): StateLayout => {
  const result = Schema.decodeUnknownResult(StateLayoutSchema)(value);
  if (result._tag === 'Failure') throw stateCompatibilityError();
  const layout = result.success;
  const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
  const missingParent = layout.nodes.some((node) => node.parentId && !nodes.has(node.parentId));
  const missingEndpoint = layout.edges.some(
    (edge) => !nodes.has(edge.start) || !nodes.has(edge.end),
  );
  const invalid = missingParent || missingEndpoint || nodes.size !== layout.nodes.length;
  if (invalid) throw stateCompatibilityError();
  return layout;
};

const getRegionOrdinals = (nodes: StateLayout['nodes']) => {
  const counts = new Map<string | undefined, number>();
  const ordinals = new Map<string, number>();
  nodes.forEach((node) => {
    if (node.shape !== 'divider') return;
    const ordinal = counts.get(node.parentId) || 0;
    counts.set(node.parentId, ordinal + 1);
    ordinals.set(node.id, ordinal);
  });
  return ordinals;
};

const getStableIds = (layout: StateLayout, nodes: Map<string, StateLayoutNode>) => {
  const regions = getRegionOrdinals(layout.nodes);
  const associations = layout.edges.filter((edge) => !edge.arrowTypeEnd);
  const notes = new Map(associations.map((edge) => [edge.end, edge.start]));
  const ids = new Map<string, string>();
  const visiting = new Set<string>();
  const resolve = (node: StateLayoutNode): string => {
    const cached = ids.get(node.id);
    if (cached) return cached;
    if (visiting.has(node.id)) throw stateCompatibilityError();
    visiting.add(node.id);
    const parent = node.parentId ? resolve(nodes.get(node.parentId)!) : 'root';
    const key = getStateKey(node, parent, regions, notes);
    const id = `state:${encodeURIComponent(JSON.stringify(key))}`;
    ids.set(node.id, id);
    visiting.delete(node.id);
    return id;
  };
  layout.nodes.forEach(resolve);
  if (new Set(ids.values()).size !== nodes.size) throw stateCompatibilityError();
  return ids;
};

const getStateKey = (
  node: StateLayoutNode,
  parent: string,
  regions: Map<string, number>,
  notes: Map<string, string>,
) => {
  if (node.shape === 'divider') return ['region', parent, regions.get(node.id)!];
  const isTerminal = node.shape === 'stateStart' || node.shape === 'stateEnd';
  if (isTerminal) return [node.shape, parent];
  if (node.shape === 'note') {
    const source = notes.get(node.id);
    if (source === undefined) throw stateCompatibilityError();
    return ['note', source];
  }
  return ['node', node.id];
};

export const getTopLeft = (
  node: Pick<StateLayoutNode, 'x' | 'y' | 'width' | 'height'>,
): StatePoint => {
  const x = node.x - node.width / 2;
  const y = node.y - node.height / 2;
  return { x, y };
};

const readLabel = (label: StateLayoutNode['label']) => {
  const container = document.createElement('div');
  const source = [label ?? ''].flat().join('\n');
  container.innerHTML = source.replace(/<br\s*\/?\s*>/gi, '\n');
  return container.textContent || '';
};

export const createHandle = (
  id: string,
  type: StateHandle['type'],
  point: StatePoint,
  node: Pick<StateLayoutNode, 'x' | 'y' | 'width' | 'height'>,
): StateHandle => {
  const origin = getTopLeft(node);
  const x = point.x - origin.x;
  const y = point.y - origin.y;
  const sides = [
    { distance: Math.abs(x), position: Position.Left },
    { distance: Math.abs(x - node.width), position: Position.Right },
    { distance: Math.abs(y), position: Position.Top },
    { distance: Math.abs(y - node.height), position: Position.Bottom },
  ];
  const closest = sides.reduce((a, b) => (a.distance < b.distance ? a : b));
  return { id, type, x, y, position: closest.position };
};

const createStateEdge = (
  edge: StateLayoutEdge,
  ids: Map<string, string>,
  index: number,
  settings: TranslationSettings,
): Edge<StateEdgeData> => {
  const source = ids.get(edge.start)!;
  const target = ids.get(edge.end)!;
  const label = readLabel(edge.label);
  const arrow = Boolean(edge.arrowTypeEnd);
  const dashed = edge.pattern === 'dashed';
  const markerEnd = arrow ? { type: MarkerType.ArrowClosed, color: settings.edgeColor } : undefined;
  const data: StateEdgeData = { kind: 'state-transition', points: edge.points, arrow, dashed };
  const id = `state-edge:${encodeURIComponent(JSON.stringify([source, target, index]))}`;
  const style = createEdgeStyle(settings);
  return {
    id,
    source,
    target,
    sourceHandle: `${id}:source`,
    targetHandle: `${id}:target`,
    label,
    data,
    markerEnd,
    style,
    type: STATE_EDGE_TYPE,
  };
};

const getStateHandles = (edges: Edge<StateEdgeData>[], nodes: Map<string, StateLayoutNode>) => {
  const entries = edges.flatMap((edge) => {
    const points = edge.data!.points;
    const source = createHandle(edge.sourceHandle!, 'source', points[0], nodes.get(edge.source)!);
    const target = createHandle(
      edge.targetHandle!,
      'target',
      points[points.length - 1],
      nodes.get(edge.target)!,
    );
    return [
      { nodeId: edge.source, handle: source },
      { nodeId: edge.target, handle: target },
    ];
  });
  const grouped = EffectArray.groupBy(entries, ({ nodeId }) => nodeId);
  const handles = Array.from(Object.entries(grouped), ([nodeId, items]) => {
    const values = items.map(({ handle }) => handle);
    return [nodeId, values] as const;
  });
  return new Map(handles);
};

const createStateNode = ({
  node,
  ids,
  nodes,
  handles,
  settings,
}: StateNodeOptions): Node<StateNodeData> => {
  const id = ids.get(node.id)!;
  const parentId = node.parentId ? ids.get(node.parentId) : undefined;
  const parent = node.parentId ? getTopLeft(nodes.get(node.parentId)!) : { x: 0, y: 0 };
  const origin = getTopLeft(node);
  const position = { x: origin.x - parent.x, y: origin.y - parent.y };
  const label = readLabel(node.label);
  const style = createNodeStyle(settings);
  const data: StateNodeData = {
    kind: 'state-node',
    shape: node.shape,
    label,
    handles: handles.get(id) || [],
    style,
  };
  const frame = { width: node.width, height: node.height };
  const selectable = node.shape !== 'noteGroup';
  return {
    id,
    type: STATE_NODE_TYPE,
    position,
    parentId,
    extent: parentId ? 'parent' : undefined,
    data,
    style: frame,
    selectable,
    connectable: false,
  };
};

const orderStateNodes = (nodes: Node<StateNodeData>[]) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ordered = new Map<string, Node<StateNodeData>>();
  const visit = (node: Node<StateNodeData>) => {
    if (ordered.has(node.id)) return;
    if (node.parentId) visit(byId.get(node.parentId)!);
    ordered.set(node.id, node);
  };
  nodes.forEach(visit);
  return Array.from(ordered.values());
};

const createStateEdges = (
  layout: StateLayout,
  ids: Map<string, string>,
  settings: TranslationSettings,
) => {
  const occurrences = new Map<string, number>();
  const edges = new Map<string, Edge<StateEdgeData>>();
  layout.edges.forEach((edge) => {
    const pair = JSON.stringify([edge.start, edge.end]);
    const index = occurrences.get(pair) || 0;
    occurrences.set(pair, index + 1);
    const converted = createStateEdge(edge, ids, index, settings);
    edges.set(converted.id, converted);
  });
  return Array.from(edges.values());
};

export const createStateElements = (
  layout: StateLayout,
  settings: TranslationSettings,
): GraphElements => {
  const byRawId = new Map(layout.nodes.map((node) => [node.id, node]));
  const ids = getStableIds(layout, byRawId);
  const byStableId = new Map(layout.nodes.map((node) => [ids.get(node.id)!, node]));
  const edges = createStateEdges(layout, ids, settings);
  const handles = getStateHandles(edges, byStableId);
  const nodes = layout.nodes.map((node) =>
    createStateNode({ node, ids, nodes: byRawId, handles, settings }),
  );
  return { nodes: orderStateNodes(nodes), edges };
};

export const createLayoutHost = (id: string, fontFamily: string) => {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'absolute',
    visibility: 'hidden',
    pointerEvents: 'none',
    fontFamily,
  });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = id;
  svg.append(document.createElementNS('http://www.w3.org/2000/svg', 'g'));
  host.append(svg);
  document.body.append(host);
  return host;
};

export const renderStateDiagram = async (
  id: string,
  source: string,
  settings: TranslationSettings,
) => {
  const host = createLayoutHost(id, settings.fontFamily);
  try {
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(source);
    await diagram.render(id, mermaidMetadata.version);
    const db = diagram.db;
    const getData = 'getData' in db ? db.getData : undefined;
    if (typeof getData !== 'function') throw stateCompatibilityError();
    const layout = readStateLayout(getData.call(db));
    const missingGeometry = layout.nodes.some(
      (node) => !host.querySelector(`[id="${CSS.escape(node.domId)}"]`),
    );
    if (missingGeometry) throw stateCompatibilityError();
    return createStateElements(layout, settings);
  } finally {
    host.remove();
  }
};
