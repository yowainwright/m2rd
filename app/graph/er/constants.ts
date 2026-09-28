import { Schema } from 'effect';
import { StatePointSchema } from '../state/constants';

export const ER_NODE_TYPE = 'erNode';
export const ER_EDGE_TYPE = 'erRelation';
export const ER_CARDINALITIES = ['only_one', 'zero_or_one', 'one_or_more', 'zero_or_more'] as const;
export const ErAttributeSchema = Schema.Struct({
  type: Schema.String,
  name: Schema.String,
  keys: Schema.Array(Schema.Literal('PK', 'FK', 'UK')),
  comment: Schema.String,
});
export const ErNodeSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  alias: Schema.String,
  shape: Schema.Literal('erBox'),
  isGroup: Schema.Literal(false),
  look: Schema.Literal('classic', 'neo'),
  attributes: Schema.Array(ErAttributeSchema),
});
export const ErEdgeSchema = Schema.Struct({
  id: Schema.String,
  start: Schema.String,
  end: Schema.String,
  label: Schema.String,
  arrowTypeStart: Schema.Literal(...ER_CARDINALITIES),
  arrowTypeEnd: Schema.Literal(...ER_CARDINALITIES),
  pattern: Schema.Literal('solid', 'dashed'),
});
export const ErMetadataSchema = Schema.Struct({
  nodes: Schema.Array(ErNodeSchema),
  edges: Schema.Array(ErEdgeSchema),
});
export const ErPointsSchema = Schema.Array(StatePointSchema).pipe(Schema.minItems(2));

export const ER_MARKERS = {
  only_one: { path: 'M3,0 L3,18 M9,0 L9,18', width: 18, height: 18, circle: false },
  zero_or_one: { path: 'M21,0 L21,18', width: 30, height: 18, circle: true },
  one_or_more: {
    path: 'M3,9 L3,27 M9,18 Q27,0 45,18 Q27,36 9,18',
    width: 45,
    height: 36,
    circle: false,
  },
  zero_or_more: { path: 'M21,18 Q39,0 57,18 Q39,36 21,18', width: 57, height: 36, circle: true },
};
