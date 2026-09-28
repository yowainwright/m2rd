import { Array as EffectArray } from 'effect';
import mermaid from 'mermaid';
import type { Edge, Node } from 'reactflow';
import type { GraphElements, TranslationSettings } from '../types';
import type { StateHandle } from '../state/types';
import { createHandle, createLayoutHost, getTopLeft } from '../state';
import { createEdgeStyle, createSequenceStyle } from '../utils';
import { decodeClassLabel } from '../class/utils';
import { ER_EDGE_TYPE, ER_NODE_TYPE } from './constants';
import {
  erCompatibilityError,
  erRelationKey,
  readErGeometry,
  readErMetadata,
  readErPoints,
} from './utils';
import type {
  ErEdgeData,
  ErGeometry,
  ErGraphics,
  ErMetadata,
  ErMetadataEdge,
  ErNodeData,
} from './types';

const createErEdge = ({
  edge,
  id,
  ids,
  points,
  settings,
}: {
  edge: ErMetadataEdge;
  id: string;
  ids: ReadonlyMap<string, string>;
  points: ErEdgeData['points'];
  settings: TranslationSettings;
}): Edge<ErEdgeData> => {
  const source = ids.get(edge.start)!;
  const target = ids.get(edge.end)!;
  const label = decodeClassLabel(edge.label);
  const style = createEdgeStyle(settings);
  const data: ErEdgeData = {
    kind: 'er-relation',
    points,
    startMarker: edge.arrowTypeStart,
    endMarker: edge.arrowTypeEnd,
    pattern: edge.pattern,
  };
  return {
    id,
    source,
    target,
    label,
    style,
    data,
    type: ER_EDGE_TYPE,
    sourceHandle: `${id}:source`,
    targetHandle: `${id}:target`,
    animated: false,
    deletable: false,
    updatable: false,
  };
};

const createErEdges = ({
  graphics,
  id,
  metadata,
  ids,
  settings,
}: {
  graphics: ErGraphics;
  id: string;
  metadata: ErMetadata;
  ids: ReadonlyMap<string, string>;
  settings: TranslationSettings;
}) => {
  const occurrences = new Map<string, number>();
  const edges = new Map<string, Edge<ErEdgeData>>();
  metadata.edges.forEach((edge) => {
    const key = erRelationKey(edge, ids);
    const ordinal = occurrences.get(key) || 0;
    occurrences.set(key, ordinal + 1);
    const edgeId = `er-edge:${encodeURIComponent(JSON.stringify([key, ordinal]))}`;
    const points = readErPoints(graphics, `${id}-${edge.id}`);
    edges.set(edgeId, createErEdge({ edge, id: edgeId, ids, points, settings }));
  });
  return Array.from(edges.values());
};

const createErHandles = (edges: Edge<ErEdgeData>[], geometry: ReadonlyMap<string, ErGeometry>) => {
  const entries = edges.flatMap((edge) => {
    const points = edge.data!.points;
    const source = createHandle(
      edge.sourceHandle!,
      'source',
      points[0],
      geometry.get(edge.source)!.frame,
    );
    const target = createHandle(
      edge.targetHandle!,
      'target',
      points[points.length - 1],
      geometry.get(edge.target)!.frame,
    );
    return [
      { node: edge.source, handle: source },
      { node: edge.target, handle: target },
    ];
  });
  const grouped = EffectArray.groupBy(entries, ({ node }) => node);
  const handles = Array.from(Object.entries(grouped), ([id, items]) => {
    const values = items.map(({ handle }) => handle);
    return [id, values] as const;
  });
  return new Map(handles);
};

const createErNode = (
  id: string,
  geometry: ErGeometry,
  handles: ReadonlyMap<string, StateHandle[]>,
  settings: TranslationSettings,
): Node<ErNodeData> => {
  const { frame, data: content } = geometry;
  const position = getTopLeft(frame);
  const style = { width: frame.width, height: frame.height };
  const data = Object.assign({}, content, {
    handles: handles.get(id) || [],
    style: createSequenceStyle(settings),
  });
  return { id, position, style, data, type: ER_NODE_TYPE, connectable: false, deletable: false };
};

const createErElements = (
  host: Element,
  id: string,
  metadata: ErMetadata,
  settings: TranslationSettings,
): GraphElements => {
  const graphics = new Map(
    Array.from(host.querySelectorAll('[id]'), (element) => [element.id, element]),
  );
  const ids = new Map(
    metadata.nodes.map((node) => [node.id, `er:${encodeURIComponent(node.label)}`]),
  );
  const entries = metadata.nodes.map((node) => {
    const geometry = readErGeometry(graphics, id, node);
    return [ids.get(node.id)!, geometry] as const;
  });
  const geometry = new Map(entries);
  const edges = createErEdges({ graphics, id, metadata, ids, settings });
  const handles = createErHandles(edges, geometry);
  const nodes = entries.map(([nodeId, shape]) => createErNode(nodeId, shape, handles, settings));
  return { nodes, edges };
};

export const renderErDiagram = async (
  id: string,
  source: string,
  settings: TranslationSettings,
) => {
  const host = createLayoutHost(id, settings.fontFamily);
  try {
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(source);
    const db = diagram.db;
    const getData = 'getData' in db ? db.getData : undefined;
    if (typeof getData !== 'function') throw erCompatibilityError();
    const metadata = readErMetadata(getData.call(db));
    host.replaceChildren();
    const rendered = await mermaid.render(id, source, host);
    host.innerHTML = rendered.svg;
    const richLabel = host.querySelector(
      '.edgeLabel strong, .edgeLabel em, .edgeLabel code, .edgeLabel a',
    );
    if (richLabel) throw erCompatibilityError();
    return createErElements(host, id, metadata, settings);
  } finally {
    host.remove();
  }
};
