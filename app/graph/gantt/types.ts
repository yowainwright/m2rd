import { Schema } from 'effect';
import { GraphStyleSchema } from '../types';
import type { TranslationSettings } from '../types';
import type { CSSProperties } from 'react';
import type { GanttTaskSchema } from './constants';

export type GanttTask = Schema.Schema.Type<typeof GanttTaskSchema>;
export type GanttBounds = { x: number; y: number; width: number; height: number };
export type GanttPart = {
  kind: 'rect' | 'text' | 'line';
  text?: string;
  style: CSSProperties;
};
export type GanttGraphic = { bounds: GanttBounds; part: GanttPart };
export type GanttNodeData = {
  kind: 'gantt-task' | 'gantt-frame';
  label: string;
  status: string;
  start?: string;
  end?: string;
  section?: string;
  ambiguousIdentity?: boolean;
  parts: GanttPart[];
  sourceStyle: CSSProperties;
  style: CSSProperties;
};

export interface GanttTaskOptions {
  svg: SVGSVGElement;
  renderId: string;
  task: GanttTask;
  id: string;
  ambiguousIdentity: boolean;
  settings: TranslationSettings;
}

export const GanttNodeDataSchema = Schema.Struct({
  kind: Schema.Literals(['gantt-task', 'gantt-frame']),
  label: Schema.String,
  status: Schema.String,
  start: Schema.optional(Schema.String),
  end: Schema.optional(Schema.String),
  section: Schema.optional(Schema.String),
  ambiguousIdentity: Schema.optional(Schema.Boolean),
  parts: Schema.Array(
    Schema.Struct({
      kind: Schema.Literals(['rect', 'text', 'line']),
      text: Schema.optional(Schema.String),
      style: GraphStyleSchema,
    }),
  ),
  sourceStyle: GraphStyleSchema,
  style: GraphStyleSchema,
});
