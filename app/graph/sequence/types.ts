import { Schema } from 'effect';
import { GraphEdgeTypeSchema, GraphPointSchema, GraphStyleSchema } from '../types';
import type { SequenceFrameData, SequenceFrameSection } from '../types';

export type SequenceBounds = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type SequenceFrameRecord = SequenceBounds & {
  fill?: string;
  frameType: SequenceFrameData['frameType'];
  id: string;
  label: string;
  sections: SequenceFrameSection[];
};

const sequenceAppearance = {
  label: Schema.String,
  style: GraphStyleSchema,
  styleVersion: Schema.optional(Schema.Literal(1)),
};

const SequenceNumberSchema = Schema.optional(Schema.String);

export const SequenceParticipantDataSchema = Schema.Struct({
  ...sequenceAppearance,
  kind: Schema.Literal('sequence-participant'),
  activations: Schema.Array(
    Schema.Struct({
      ...GraphPointSchema.fields,
      width: Schema.Finite,
      height: Schema.Finite,
    }),
  ),
  handles: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      sourceY: Schema.Finite,
      targetY: Schema.Finite,
    }),
  ),
});

export const SequenceActionDataSchema = Schema.Struct({
  ...sequenceAppearance,
  kind: Schema.Literal('sequence-action'),
  sequenceNumber: SequenceNumberSchema,
});

export const SequenceNoteDataSchema = Schema.Struct({
  ...sequenceAppearance,
  kind: Schema.Literal('sequence-note'),
});

export const SequenceFrameDataSchema = Schema.Struct({
  ...sequenceAppearance,
  kind: Schema.Literal('sequence-frame'),
  fill: Schema.optional(Schema.String),
  frameType: Schema.Literals(['alt', 'loop', 'opt', 'rect']),
  sections: Schema.Array(Schema.Struct({ label: Schema.String, y: Schema.Finite })),
});

export const SequenceMessageDataSchema = Schema.Struct({
  kind: Schema.Literal('sequence-message'),
  dashed: Schema.Boolean,
  markerEnd: Schema.Boolean,
  markerStart: Schema.Boolean,
  messageY: Schema.Finite,
  segment: Schema.Literals(['source', 'target']),
  selfMessage: Schema.Boolean,
  sequenceNumber: SequenceNumberSchema,
  edgeType: Schema.optional(GraphEdgeTypeSchema),
});
