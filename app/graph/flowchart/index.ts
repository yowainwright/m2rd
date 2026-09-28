import type { Edge, Node } from 'reactflow';
import { EDGE_ID_PATTERN, EDGE_SELECTOR, NODE_ID_PATTERN, SURGE_EDGE_TYPE } from '../constants';
import type { FlowNodeRecord, GraphElements, TranslationSettings } from '../types';
import {
  createNodeStyle,
  createEdgeStyle,
  createEdgeMarker,
  getEdgeType,
  getEdgeAnimated,
  getEdgeAnimationClassName,
} from '../utils';
import { getText } from '../svg/utils';

const getNodeId = (domId: string) => {
  const [, nodeId] = domId.match(NODE_ID_PATTERN) || [];

  return nodeId || domId;
};

const getClassValue = (element: Element, prefix: string) => {
  const token = Array.from(element.classList).find((className) => className.startsWith(prefix));

  return token?.slice(prefix.length);
};

const getEdgeIdEndpoints = (edge: Element) => {
  const id = edge.getAttribute('id') || '';
  const [, source, target] = id.match(EDGE_ID_PATTERN) || [];

  return { source, target };
};

const readNodeRecords = (svg: SVGSVGElement): FlowNodeRecord[] => {
  return Array.from(svg.querySelectorAll('.node')).map((node, index) => {
    const domId = node.getAttribute('id') || `node-${index}`;
    const id = getNodeId(domId);
    const label = getText(node, '.nodeLabel') || id;

    return { domId, id, label };
  });
};

const createEndpointMap = (nodes: FlowNodeRecord[]) => {
  const entries = nodes.flatMap<[string, string]>((node) => [
    [node.id, node.id],
    [node.domId, node.id],
  ]);

  return new Map(entries);
};

const getEndpoint = (
  rawValue: string | undefined,
  endpointMap: Map<string, string>,
  fallback: string,
) => {
  if (!rawValue) {
    return fallback;
  }

  const directEndpoint = endpointMap.get(rawValue);

  if (directEndpoint) {
    return directEndpoint;
  }

  const nodeId = getNodeId(rawValue);
  const nodeEndpoint = endpointMap.get(nodeId);

  return nodeEndpoint || fallback;
};

const createFlowNode = (
  node: FlowNodeRecord,
  index: number,
  settings: TranslationSettings,
): Node => {
  const x = index * 280;
  const isEven = index % 2 === 0;
  const y = isEven ? 0 : 120;

  return {
    id: node.id,
    data: { label: node.label },
    position: { x, y },
    style: createNodeStyle(settings),
  };
};

const createFlowEdge = ({
  edge,
  index,
  nodes,
  settings,
  endpointMap,
}: {
  edge: Element;
  index: number;
  nodes: FlowNodeRecord[];
  settings: TranslationSettings;
  endpointMap: Map<string, string>;
}): Edge => {
  const edgeIdEndpoints = getEdgeIdEndpoints(edge);
  const source = getClassValue(edge, 'LS-') || edgeIdEndpoints.source;
  const target = getClassValue(edge, 'LE-') || edgeIdEndpoints.target;
  const sourceFallback = nodes[index]?.id || '';
  const targetFallback = nodes[index + 1]?.id || '';
  const sourceId = getEndpoint(source, endpointMap, sourceFallback);
  const targetId = getEndpoint(target, endpointMap, targetFallback);
  const isSurge = settings.edgeAnimation === 'surge';
  const data = isSurge ? { edgeType: settings.edgeType } : undefined;
  const type = isSurge ? SURGE_EDGE_TYPE : getEdgeType(settings);

  return {
    id: `edge-${index}`,
    source: sourceId,
    target: targetId,
    animated: getEdgeAnimated(settings),
    className: getEdgeAnimationClassName(settings),
    data,
    label: getText(edge, 'title'),
    markerEnd: createEdgeMarker(settings.edgeMarker, settings.edgeColor),
    style: createEdgeStyle(settings),
    type,
  };
};

const createFlowEdges = (
  svg: SVGSVGElement,
  nodes: FlowNodeRecord[],
  settings: TranslationSettings,
) => {
  const endpointMap = createEndpointMap(nodes);
  return Array.from(svg.querySelectorAll(EDGE_SELECTOR)).map((edge, index) =>
    createFlowEdge({ edge, index, nodes, settings, endpointMap }),
  );
};

export const parseFlowchartSvg = (
  svg: SVGSVGElement,
  settings: TranslationSettings,
): GraphElements => {
  const records = readNodeRecords(svg);
  const nodes = records.map((node, index) => createFlowNode(node, index, settings));
  const edges = createFlowEdges(svg, records, settings);
  return { nodes, edges };
};
