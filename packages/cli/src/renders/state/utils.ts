import { Schema } from 'effect';
import { JSDOM } from 'jsdom';
import { StateLayoutSchema } from '@/app/graph/state/constants';
import { cleanText } from '../../utils';
import type { RenderedMermaid } from '../../types';
import type { FlowGraph, FlowNode } from '../flowchart/types';
import { STATE_FRAMES, STATE_ROLES, UNSUPPORTED_STATE_SHAPES } from './constants';
import type { StateLayout, StateNode } from './types';

export const readState = ({ data, svg }: RenderedMermaid): FlowGraph => {
  const layout = Schema.decodeUnknownSync(StateLayoutSchema)(data);
  validateState(layout);
  const nodes = layout.nodes.map((node) => readStateNode(node, svg));
  const edges = layout.edges.map((edge) => {
    const label = stateText(edge.label);
    const arrow = Boolean(edge.arrowTypeEnd);
    if (edge.pattern === 'dashed')
      throw new Error('Dashed state transitions are not supported yet.');
    return { id: edge.id, source: edge.start, target: edge.end, label, arrow };
  });
  return { nodes, edges };
};

const readStateNode = (node: StateNode, svg: Document): FlowNode => {
  if (UNSUPPORTED_STATE_SHAPES.includes(node.shape))
    throw new Error(
      'State notes and concurrent regions are not supported in this CLI preview yet.',
    );
  if (!svg.getElementById(node.domId)) throw new Error(`Mermaid did not render state ${node.id}.`);
  const label = stateLabel(node);
  const decision = node.shape === 'choice';
  const frame = STATE_FRAMES.includes(node.shape);
  const role = stateRole(node);
  return { id: node.id, label, decision, frame, role, parentId: node.parentId };
};

const stateRole = (node: StateNode): FlowNode['role'] => {
  if (node.shape === 'stateStart') return 'start';
  if (node.shape === 'stateEnd') return 'end';
  return undefined;
};

const stateLabel = (node: StateNode) => {
  if (node.shape === 'stateStart') return 'Start';
  if (node.shape === 'stateEnd') return 'End';
  const label = stateText(node.label) || node.id;
  if (STATE_ROLES.includes(node.shape)) return `${label}\n[${node.shape}]`;
  return label;
};

const stateText = (label: string | readonly string[] | undefined) => {
  const source = [label ?? '']
    .flat()
    .join('\n')
    .replace(/<br\s*\/?\s*>/gi, '\n');
  return cleanText(JSDOM.fragment(source).textContent ?? '');
};

const validateState = (layout: StateLayout) => {
  const ids = new Set(layout.nodes.map((node) => node.id));
  const duplicate = ids.size !== layout.nodes.length;
  const missingParent = layout.nodes.some((node) => node.parentId && !ids.has(node.parentId));
  const missingEndpoint = layout.edges.some((edge) => !ids.has(edge.start) || !ids.has(edge.end));
  const invalid = duplicate || missingParent || missingEndpoint;
  if (invalid) throw new Error('Mermaid state relationships are inconsistent.');
};
