import { Schema } from 'effect';

const FLOW_NODE = Schema.Struct({
  id: Schema.String,
  domId: Schema.String,
  shape: Schema.String,
  isGroup: Schema.Boolean,
});

const FLOW_EDGE = Schema.Struct({
  id: Schema.String,
  start: Schema.String,
  end: Schema.String,
  label: Schema.optional(Schema.String),
  arrowTypeStart: Schema.optional(Schema.String),
  arrowTypeEnd: Schema.optional(Schema.String),
  thickness: Schema.optional(Schema.String),
  pattern: Schema.optional(Schema.String),
});

export const FLOW_DATA = Schema.Struct({
  nodes: Schema.Array(FLOW_NODE),
  edges: Schema.Array(FLOW_EDGE),
});
export const DECISION_SHAPES = ['diam', 'diamond', 'decision', 'question'];
export const NODE_COLORS = { default: 'cyan', decision: 'yellow' };
export const NODE_PADDING = 4;
export const MAX_NODE_WIDTH = 35;
export const LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.padding': '[top=0,left=0,bottom=0,right=0]',
  'elk.spacing.nodeNode': '6',
  'elk.spacing.edgeNode': '2',
  'elk.spacing.edgeEdge': '2',
  'elk.spacing.edgeLabel': '1',
  'elk.spacing.nodeSelfLoop': '2',
  'elk.layered.spacing.nodeNodeBetweenLayers': '3',
  'elk.layered.spacing.edgeNodeBetweenLayers': '1',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '2',
};

export const LINE_GLYPHS: Record<number, string> = {
  0: ' ',
  1: '│',
  2: '─',
  3: '└',
  4: '│',
  5: '│',
  6: '┌',
  7: '├',
  8: '─',
  9: '┘',
  10: '─',
  11: '┴',
  12: '┐',
  13: '┤',
  14: '┬',
  15: '┼',
};
