import { Array as EffectArray } from 'effect';
import mermaid from 'mermaid';
import mermaidMetadata from 'mermaid/package.json';
import type { Edge, Node } from 'reactflow';
import type { GraphElements, TranslationSettings } from '../types';
import type { StateHandle } from '../state/types';
import { createHandle, createLayoutHost, getTopLeft } from '../state';
import { createEdgeStyle, createSequenceStyle } from '../utils';
import { CLASS_EDGE_TYPE, CLASS_NODE_TYPE } from './constants';
import {
  classCompatibilityError,
  classRelationKey,
  decodeClassLabel,
  readClassGeometry,
  readClassMetadata,
  readClassPoints,
} from './utils';
import type {
  ClassEdgeData,
  ClassGeometry,
  ClassGraphics,
  ClassMetadata,
  ClassMetadataEdge,
  ClassMetadataNode,
  ClassNodeData,
} from './types';

const classId = (id: string) => `class:${encodeURIComponent(id)}`;

const createClassEdge = (
  edge: ClassMetadataEdge,
  points: ClassEdgeData['points'],
  id: string,
  settings: TranslationSettings,
): Edge<ClassEdgeData> => {
  const source = classId(edge.start);
  const target = classId(edge.end);
  const label = decodeClassLabel(edge.label);
  const startLabel = decodeClassLabel(edge.startLabelRight);
  const endLabel = decodeClassLabel(edge.endLabelLeft);
  const style = createEdgeStyle(settings);
  const data: ClassEdgeData = {
    kind: 'class-relation',
    points,
    startMarker: edge.arrowTypeStart,
    endMarker: edge.arrowTypeEnd,
    startLabel,
    endLabel,
    pattern: edge.pattern,
  };
  return {
    id,
    source,
    target,
    label,
    data,
    style,
    type: CLASS_EDGE_TYPE,
    sourceHandle: `${id}:source`,
    targetHandle: `${id}:target`,
    animated: false,
  };
};

const createClassEdges = (
  graphics: ClassGraphics,
  id: string,
  metadata: ClassMetadata,
  settings: TranslationSettings,
) => {
  const occurrences = new Map<string, number>();
  const edges = new Map<string, Edge<ClassEdgeData>>();
  metadata.edges.forEach((edge) => {
    const key = classRelationKey(edge);
    const ordinal = occurrences.get(key) || 0;
    occurrences.set(key, ordinal + 1);
    const points = readClassPoints(graphics, `${id}-${edge.id}`);
    const edgeId = `class-edge:${encodeURIComponent(JSON.stringify([key, ordinal]))}`;
    const converted = createClassEdge(edge, points, edgeId, settings);
    edges.set(converted.id, converted);
  });
  return Array.from(edges.values());
};

const createClassHandles = (edges: Edge<ClassEdgeData>[], geometry: Map<string, ClassGeometry>) => {
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
  const handles = Array.from(Object.entries(grouped), ([node, items]) => {
    const values = items.map(({ handle }) => handle);
    return [node, values] as const;
  });
  return new Map(handles);
};

const createClassNode = (
  node: ClassMetadataNode,
  geometry: Map<string, ClassGeometry>,
  handles: Map<string, StateHandle[]>,
  settings: TranslationSettings,
): Node<ClassNodeData> => {
  const id = classId(node.id);
  const { frame, data: content } = geometry.get(id)!;
  const origin = getTopLeft(frame);
  const parentId = node.parentId ? classId(node.parentId) : undefined;
  const parent = parentId ? getTopLeft(geometry.get(parentId)!.frame) : { x: 0, y: 0 };
  const position = { x: origin.x - parent.x, y: origin.y - parent.y };
  const data = Object.assign({}, content, {
    handles: handles.get(id) || [],
    style: createSequenceStyle(settings),
  });
  const style = { width: frame.width, height: frame.height };
  const extent = parentId ? 'parent' : undefined;
  return { id, parentId, position, data, style, extent, type: CLASS_NODE_TYPE, connectable: false };
};

const orderClassNodes = (nodes: Node<ClassNodeData>[]) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ordered = new Map<string, Node<ClassNodeData>>();
  const visiting = new Set<string>();
  const visit = (node: Node<ClassNodeData>) => {
    if (ordered.has(node.id)) return;
    if (visiting.has(node.id)) throw classCompatibilityError();
    visiting.add(node.id);
    if (node.parentId) visit(byId.get(node.parentId)!);
    ordered.set(node.id, node);
    visiting.delete(node.id);
  };
  nodes.forEach(visit);
  return Array.from(ordered.values());
};

const createClassElements = (
  host: Element,
  id: string,
  metadata: ClassMetadata,
  settings: TranslationSettings,
): GraphElements => {
  const graphics = new Map(
    Array.from(host.querySelectorAll('[id]'), (element) => [element.id, element]),
  );
  const entries = metadata.nodes.map((node) => {
    const geometry = readClassGeometry(graphics, id, node);
    return [classId(node.id), geometry] as const;
  });
  const geometry = new Map(entries);
  const edges = createClassEdges(graphics, id, metadata, settings);
  const handles = createClassHandles(edges, geometry);
  const nodes = metadata.nodes.map((node) => createClassNode(node, geometry, handles, settings));
  return { nodes: orderClassNodes(nodes), edges };
};

export const renderClassDiagram = async (
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
    if (typeof getData !== 'function') throw classCompatibilityError();
    const metadata = readClassMetadata(getData.call(db));
    return createClassElements(host, id, metadata, settings);
  } finally {
    host.remove();
  }
};
