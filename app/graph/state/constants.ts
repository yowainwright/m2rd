import { Schema } from 'effect';

export const STATE_NODE_TYPE = 'stateNode';
export const STATE_EDGE_TYPE = 'stateTransition';
export const STATE_COMPATIBILITY_ERROR =
  'Mermaid state diagram data is incompatible with this version of m2rd.';
export const STATE_SHAPES = [
  'rect',
  'roundedRect',
  'rectWithTitle',
  'roundedWithTitle',
  'stateStart',
  'stateEnd',
  'choice',
  'fork',
  'join',
  'divider',
  'note',
  'noteGroup',
] as const;
export const StatePointSchema = Schema.Struct({
  x: Schema.Number.check(Schema.isFinite()),
  y: Schema.Number.check(Schema.isFinite()),
});
export const StateNodeSchema = Schema.Struct({
  id: Schema.String,
  domId: Schema.String,
  shape: Schema.Literals(STATE_SHAPES),
  label: Schema.optional(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  parentId: Schema.optional(Schema.String),
  x: Schema.Number.check(Schema.isFinite()),
  y: Schema.Number.check(Schema.isFinite()),
  width: Schema.Number.check(Schema.isGreaterThan(0), Schema.isFinite()),
  height: Schema.Number.check(Schema.isGreaterThan(0), Schema.isFinite()),
});
export const StateEdgeSchema = Schema.Struct({
  id: Schema.String,
  start: Schema.String,
  end: Schema.String,
  label: Schema.optional(Schema.String),
  arrowTypeEnd: Schema.String,
  pattern: Schema.optional(Schema.String),
  points: Schema.Array(StatePointSchema).check(Schema.isMinLength(2)),
});
export const StateLayoutSchema = Schema.Struct({
  nodes: Schema.Array(StateNodeSchema),
  edges: Schema.Array(StateEdgeSchema),
});
export const STATE_SYMBOLS = new Set(['stateStart', 'stateEnd', 'choice', 'fork', 'join']);
export const STATE_GROUPS = new Set(['roundedWithTitle', 'divider', 'noteGroup']);
export const STATE_HANDLE_STYLE = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: 0,
  padding: 0,
};
