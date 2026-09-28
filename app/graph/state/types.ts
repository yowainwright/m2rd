import type { TranslationSettings } from '../types';
import type { CSSProperties } from 'react';
import type { Schema } from 'effect';
import type { Position } from 'reactflow';
import type {
  StateEdgeSchema,
  StateLayoutSchema,
  StateNodeSchema,
  StatePointSchema,
} from './constants';

export type StateLayout = Schema.Schema.Type<typeof StateLayoutSchema>;
export type StateLayoutNode = Schema.Schema.Type<typeof StateNodeSchema>;
export type StateLayoutEdge = Schema.Schema.Type<typeof StateEdgeSchema>;
export type StatePoint = Schema.Schema.Type<typeof StatePointSchema>;
export type StateHandle = StatePoint & {
  id: string;
  type: 'source' | 'target';
  position: Position;
};
export type StateNodeData = {
  kind: 'state-node';
  shape: StateLayoutNode['shape'];
  label: string;
  handles: StateHandle[];
  style: CSSProperties;
};
export type StateEdgeData = {
  kind: 'state-transition';
  points: readonly StatePoint[];
  arrow: boolean;
  dashed: boolean;
};

export interface StateNodeOptions {
  node: StateLayoutNode;
  ids: Map<string, string>;
  nodes: Map<string, StateLayoutNode>;
  handles: Map<string, StateHandle[]>;
  settings: TranslationSettings;
}
