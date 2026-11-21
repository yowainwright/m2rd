import { Schema } from 'effect';
import { GraphStyleSchema } from '../types';
import { StateHandleSchema } from '../state/types';
import type { CSSProperties } from 'react';
import type { StateHandle, StatePoint } from '../state/types';
import {
  ClassEdgeSchema,
  ClassPointsSchema,
  type ClassMetadataSchema,
  type ClassNodeSchema,
} from './constants';

export type ClassMetadata = Schema.Schema.Type<typeof ClassMetadataSchema>;
export type ClassMetadataNode = Schema.Schema.Type<typeof ClassNodeSchema>;
export type ClassMetadataEdge = Schema.Schema.Type<typeof ClassEdgeSchema>;
export type ClassMarker = ClassMetadataEdge['arrowTypeStart'];
export type ClassFrame = StatePoint & { width: number; height: number };
export type ClassGraphics = ReadonlyMap<string, Element>;
export type ClassRow = { text: string; style: CSSProperties };
export type ClassNodeData = {
  kind: 'class-node';
  shape: 'classBox' | 'namespace' | 'note' | 'interface';
  label: string;
  rows: ClassRow[];
  dividers: number[];
  handles: StateHandle[];
  sourceStyle: CSSProperties;
  style: CSSProperties;
};
export type ClassEdgeData = {
  kind: 'class-relation';
  points: readonly StatePoint[];
  startMarker: ClassMarker;
  endMarker: ClassMarker;
  startLabel: string;
  endLabel: string;
  pattern: ClassMetadataEdge['pattern'];
};
export type ClassGeometry = {
  frame: ClassFrame;
  data: Omit<ClassNodeData, 'handles' | 'style'>;
};

export const ClassNodeDataSchema = Schema.Struct({
  kind: Schema.Literal('class-node'),
  shape: Schema.Literals(['classBox', 'namespace', 'note', 'interface']),
  label: Schema.String,
  rows: Schema.Array(Schema.Struct({ text: Schema.String, style: GraphStyleSchema })),
  dividers: Schema.Array(Schema.Finite),
  handles: Schema.Array(StateHandleSchema),
  sourceStyle: GraphStyleSchema,
  style: GraphStyleSchema,
});

export const ClassEdgeDataSchema = Schema.Struct({
  kind: Schema.Literal('class-relation'),
  points: ClassPointsSchema,
  startMarker: ClassEdgeSchema.fields.arrowTypeStart,
  endMarker: ClassEdgeSchema.fields.arrowTypeEnd,
  startLabel: Schema.String,
  endLabel: Schema.String,
  pattern: ClassEdgeSchema.fields.pattern,
});
