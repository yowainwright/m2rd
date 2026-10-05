import { Schema } from 'effect';
import { StatePointSchema } from '../state/constants';

export const CLASS_NODE_TYPE = 'classNode';
export const CLASS_EDGE_TYPE = 'classRelation';
export const CLASS_COMPATIBILITY_ERROR =
  'Mermaid class diagram data is incompatible with this version of m2rd.';
export const CLASS_MARKERS = [
  'none',
  'aggregation',
  'composition',
  'extension',
  'dependency',
  'lollipop',
] as const;
const MemberSchema = Schema.Struct({ text: Schema.String, classifier: Schema.String });
export const ClassNodeSchema = Schema.Struct({
  id: Schema.String,
  domId: Schema.optional(Schema.String),
  parentId: Schema.optional(Schema.String),
  label: Schema.String,
  shape: Schema.Literals(['classBox', 'rect', 'note']),
  isGroup: Schema.Boolean,
  members: Schema.optional(Schema.Array(MemberSchema)),
  methods: Schema.optional(Schema.Array(MemberSchema)),
  annotations: Schema.optional(Schema.Array(Schema.String)),
});
export const ClassEdgeSchema = Schema.Struct({
  id: Schema.String,
  start: Schema.String,
  end: Schema.String,
  label: Schema.optional(Schema.String),
  arrowTypeStart: Schema.Literals(CLASS_MARKERS),
  arrowTypeEnd: Schema.Literals(CLASS_MARKERS),
  startLabelRight: Schema.optional(Schema.String),
  endLabelLeft: Schema.optional(Schema.String),
  pattern: Schema.Literals(['solid', 'dashed', 'dotted']),
});
export const ClassMetadataSchema = Schema.Struct({
  nodes: Schema.Array(ClassNodeSchema),
  edges: Schema.Array(ClassEdgeSchema),
});
export const ClassPointsSchema = Schema.Array(StatePointSchema).check(Schema.isMinLength(2));

export const CLASS_MARKER_PATHS = {
  aggregation: 'M 18,7 L9,13 L1,7 L9,1 Z',
  composition: 'M 18,7 L9,13 L1,7 L9,1 Z',
  extension: 'M 1,1 V13 L18,7 Z',
  dependency: 'M 9,1 L18,7 L9,13',
};
