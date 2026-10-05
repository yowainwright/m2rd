import { createElement } from 'react';
import { Box, Text, renderToString } from 'ink';
import { Array as EffectArray, Schema } from 'effect';
import stringWidth from 'string-width';
import type { ElkExtendedEdge, ElkPort } from 'elkjs';
import { Panel } from '@/app/components/ui/panel';
import { cleanText } from '../../utils';
import { MERMAID_RENDER_ID } from '../../constants';
import type { CliOptions, RenderedMermaid } from '../../types';
import { DECISION_SHAPES, FLOW_DATA, MAX_NODE_WIDTH, NODE_COLORS, NODE_PADDING } from './constants';
import type { FlowEdge, FlowGraph, FlowNode, PanelNode, TerminalLayout } from './types';
import { LAYOUT_OPTIONS } from './constants';

type MermaidNode = (typeof FLOW_DATA.Type.nodes)[number];
type MermaidEdge = (typeof FLOW_DATA.Type.edges)[number];

const readLabel = (element: Element) => {
  const rows = Array.from(element.querySelectorAll('.label .text-outer-tspan'));
  if (rows.length) return cleanText(rows.map((row) => row.textContent ?? '').join(' '));
  const text = element.querySelector('.nodeLabel, .label text')?.textContent ?? '';
  return cleanText(text);
};

const readNode = (svg: Document, node: MermaidNode): FlowNode => {
  if (node.isGroup)
    throw new Error(`Subgraph ${node.id} is not supported in this CLI preview yet.`);
  const element =
    svg.getElementById(`${MERMAID_RENDER_ID}-${node.domId}`) ?? svg.getElementById(node.domId);
  if (!element) throw new Error(`Mermaid did not render node ${node.id}.`);
  const label = readLabel(element) || node.id;
  const decision = DECISION_SHAPES.includes(node.shape);
  return { id: node.id, label, decision };
};

const readEdge = (edge: MermaidEdge): FlowEdge => {
  const startMarker = edge.arrowTypeStart ?? 'none';
  const endMarker = edge.arrowTypeEnd ?? 'none';
  const unsupportedMarker = startMarker !== 'none' || !['none', 'arrow_point'].includes(endMarker);
  const unsupportedStyle =
    ['invisible', 'thick'].includes(edge.thickness ?? '') || edge.pattern === 'dotted';
  const unsupported = unsupportedMarker || unsupportedStyle;
  if (unsupported)
    throw new Error(`Relationship ${edge.id} is not supported in this CLI preview yet.`);
  const label = cleanText(edge.label ?? '');
  const arrow = endMarker === 'arrow_point';
  return { id: edge.id, source: edge.start, target: edge.end, label, arrow };
};

export const readFlowchart = ({ data, svg }: RenderedMermaid): FlowGraph => {
  const parsed = Schema.decodeUnknownSync(FLOW_DATA)(data);
  const nodes = parsed.nodes.map((node) => readNode(svg, node));
  const edges = parsed.edges.map(readEdge);
  if (!nodes.length) throw new Error('The flowchart has no nodes.');
  return { nodes, edges };
};

export const createNodePanel = (node: FlowNode, width: number, ascii: boolean) => {
  const shapeBorder = node.decision ? 'double' : 'single';
  const borderStyle = ascii ? 'classic' : shapeBorder;
  const accented = node.decision || node.frame;
  const borderColor = accented ? NODE_COLORS.decision : NODE_COLORS.default;
  const text = createElement(Text, { wrap: 'wrap' }, node.label);
  const label = createElement(Box, { justifyContent: 'center' }, text);
  return createElement(Panel, { width, borderStyle, borderColor }, label);
};

const nodePort = (node: FlowNode, side: 'in' | 'out', width: number, height: number): ElkPort => {
  const id = `${node.id}:${side}`;
  const x = Math.floor(width / 2);
  const y = side === 'in' ? 0 : height;
  const direction = side === 'in' ? 'NORTH' : 'SOUTH';
  const layoutOptions = { 'elk.port.side': direction };
  return { id, x, y, width: 0, height: 0, layoutOptions };
};

export const measureNode = (node: FlowNode, options: CliOptions): PanelNode => {
  const lineWidths = node.label.split('\n').map((line) => stringWidth(line));
  const labelWidth = Math.max(1, ...lineWidths) + NODE_PADDING;
  const width = Math.min(labelWidth, MAX_NODE_WIDTH, options.width - 2);
  const panel = createNodePanel(node, width, options.ascii);
  const height = renderToString(panel, { columns: width }).split('\n').length;
  if (node.frame) return measureFrame(node, width, height);
  const ports = [nodePort(node, 'in', width, height), nodePort(node, 'out', width, height)];
  const layer = nodeLayer(node);
  const layoutOptions = {
    'elk.portConstraints': 'FIXED_POS',
    'elk.layered.layering.layerConstraint': layer,
  };
  return Object.assign({}, node, { width, height, ports, layoutOptions });
};

const nodeLayer = (node: FlowNode) => {
  if (node.role === 'start') return 'FIRST_SEPARATE';
  if (node.role === 'end') return 'LAST_SEPARATE';
  return 'NONE';
};

const measureFrame = (node: FlowNode, width: number, height: number): PanelNode => {
  const ports = ['in', 'out'].map((side) => {
    const id = `${node.id}:${side}`;
    const direction = side === 'in' ? 'NORTH' : 'SOUTH';
    const layoutOptions = { 'elk.port.side': direction };
    return { id, width: 0, height: 0, layoutOptions };
  });
  const layoutOptions = Object.assign({}, LAYOUT_OPTIONS, {
    'elk.portConstraints': 'FIXED_SIDE',
    'elk.padding': `[top=${height + 1},left=3,bottom=3,right=3]`,
    'elk.nodeSize.constraints': 'MINIMUM_SIZE',
    'elk.nodeSize.minimum': `(${width},${height})`,
  });
  return Object.assign({}, node, { width, height, ports, layoutOptions });
};

export const layoutEdge = (edge: FlowEdge): ElkExtendedEdge => {
  const sources = [`${edge.source}:out`];
  const targets = [`${edge.target}:in`];
  const width = stringWidth(edge.label);
  const labels = edge.label ? [{ text: edge.label, width, height: 1 }] : [];
  return { id: edge.id, sources, targets, labels };
};

const parentIds = (id: string, nodes: Map<string, FlowNode>, depth = 0): string[] => {
  if (depth > nodes.size) throw new Error('Diagram containers form a cycle.');
  const node = nodes.get(id);
  if (!node) throw new Error(`Missing diagram node ${id}.`);
  if (!node.parentId) return [];
  return [node.parentId].concat(parentIds(node.parentId, nodes, depth + 1));
};

const edgeContainer = (edge: FlowEdge, nodes: Map<string, FlowNode>) => {
  const sourceParents = parentIds(edge.source, nodes);
  const targetParents = new Set(parentIds(edge.target, nodes));
  const parent = sourceParents.find((id) => targetParents.has(id));
  return parent ? `node:${parent}` : 'root';
};

export const createLayoutInput = (graph: FlowGraph, options: CliOptions): TerminalLayout => {
  const measured = graph.nodes.map((node) => measureNode(node, options));
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  graph.nodes.forEach((node) => parentIds(node.id, nodes));
  const groups = EffectArray.groupBy(measured, (node) =>
    node.parentId ? `node:${node.parentId}` : 'root',
  );
  const edgesByParent = EffectArray.groupBy(graph.edges, (edge) => edgeContainer(edge, nodes));
  const nest = (node: PanelNode): PanelNode => {
    const key: `node:${string}` = `node:${node.id}`;
    const children = (groups[key] ?? []).map(nest);
    const edges = (edgesByParent[key] ?? []).map(layoutEdge);
    return Object.assign({}, node, { children, edges });
  };
  const children = (groups.root ?? []).map(nest);
  const edges = (edgesByParent.root ?? []).map(layoutEdge);
  const layoutOptions = Object.assign({}, LAYOUT_OPTIONS, {
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  });
  return { id: 'terminal', children, edges, layoutOptions, width: 0, height: 0 };
};
