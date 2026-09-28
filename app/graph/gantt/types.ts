import type { TranslationSettings } from '../types';
import type { Schema } from 'effect';
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
