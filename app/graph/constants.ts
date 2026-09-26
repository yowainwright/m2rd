import type { CSSProperties } from 'react';
import type {
  CanvasBackground,
  GradientDirection,
  GraphCanvasSettings,
  GraphInputFormat,
  GraphTranslationSettings,
  NodeBorder,
  NodeShape,
  NodeShadow,
  NodeSurface,
} from './types';

export const GRAPH_DATABASE_NAME = 'm2rd';
export const GRAPH_DATABASE_VERSION = 2;
export const GRAPH_VERSION_LIMIT = 5;
export const UNTITLED_GRAPH_NAME = 'Untitled graph';
export const LEGACY_UNTITLED_GRAPH_NAME = 'Untitled Graph';
export const EMPTY_GRAPH_NAME_ERROR = 'Enter a graph name.';
export const MISSING_GRAPH_ERROR = 'This saved graph no longer exists.';
export const GRAPH_INPUT_FORMAT: GraphInputFormat = 'mermaid';
export const GRAPH_DIAGRAM_TYPES = [
  'flowchart',
  'sequence',
  'stateDiagram',
  'classDiagram',
  'er',
  'gantt',
] as const;
export const SEQUENCE_PARTICIPANT_NODE_TYPE = 'sequenceParticipant';
export const SEQUENCE_ACTION_NODE_TYPE = 'sequenceAction';
export const SEQUENCE_NOTE_NODE_TYPE = 'sequenceNote';
export const SEQUENCE_FRAME_NODE_TYPE = 'sequenceFrame';
export const SEQUENCE_MESSAGE_EDGE_TYPE = 'sequenceMessage';
export const SEQUENCE_ACTOR_FIGURE_WIDTH = 50;
export const SEQUENCE_ACTION_NODE_HEIGHT = 32;
export const SEQUENCE_ACTION_NODE_MIN_WIDTH = 48;
export const SEQUENCE_SELF_MESSAGE_HEIGHT = 36;
export const SEQUENCE_SELF_MESSAGE_OFFSET = 56;
export const SEQUENCE_HANDLE_STYLE: CSSProperties = {
  border: 0,
  height: 1,
  left: '50%',
  minHeight: 0,
  minWidth: 0,
  opacity: 0,
  pointerEvents: 'none',
  right: 'auto',
  transform: 'translate(0, -50%)',
  width: 1,
};
export const SEQUENCE_RIGHT_HANDLE_STYLE: CSSProperties = Object.assign({}, SEQUENCE_HANDLE_STYLE, {
  left: 'calc(50% - 1px)',
});

// Color inputs need hex values corresponding to the Tailwind defaults.
export const SEQUENCE_NODE_DEFAULTS: Record<
  string,
  { fill: string; border: NodeBorder; surface: NodeSurface }
> = {
  'sequence-participant': { fill: '#f3f4f6', border: 'solid', surface: 'solid' },
  'sequence-action': { fill: '#ffffff', border: 'none', surface: 'solid' },
  'sequence-note': { fill: '#f9fafb', border: 'solid', surface: 'solid' },
  'sequence-frame': { fill: '#ffffff', border: 'dashed', surface: 'solid' },
  'sequence-region': { fill: '#f9fafb', border: 'none', surface: 'pattern-diagonal' },
};

export const GRAPH_TABLES = {
  inputs: 'inputs',
  translations: 'translations',
  workspaces: 'workspaces',
} as const;

export const DEFAULT_SETTINGS = {
  edgeAnimation: 'none',
  edgeColor: '#171717',
  edgeMarker: 'arrowclosed',
  edgeType: 'default',
  edgeWidth: 2,
  primaryColor: '#cccccc',
  inverseColor: '#171717',
  fontFamily: 'Arial, Helvetica, sans-serif',
  nodeGradient: {
    colorA: '#2563eb',
    colorB: '#06b6d4',
    direction: 'vertical',
    split: 50,
  },
  nodeBorder: 'solid',
  nodeShape: 'rectangle',
  nodeShadow: 'none',
  nodeSurface: 'solid',
} as const;

export const EMPTY_ELEMENTS = {
  nodes: [],
  edges: [],
};

export const EDGE_WIDTH_LIMITS = { minimum: 1, maximum: 8 } as const;
export const CANVAS_GRID: [number, number] = [20, 20];
export const DEFAULT_CANVAS_SETTINGS: GraphCanvasSettings = {
  background: 'none',
  gradient: {
    colorA: '#0f172a',
    colorB: '#2563eb',
    direction: 'vertical',
    split: 50,
  },
  pattern: {
    backgroundColor: '#0f172a',
    color: '#22d3ee',
    density: 50,
  },
  shader: {
    aurora: {
      colorA: '#0f172a',
      colorB: '#22d3ee',
      colorC: '#818cf8',
    },
    gradientMesh: {
      colorA: '#0f172a',
      colorB: '#6366f1',
    },
  },
  gridVisible: false,
  locked: false,
  snapToGrid: false,
};

export const EDGE_ANIMATION_OPTIONS: Array<{
  label: string;
  value: GraphTranslationSettings['edgeAnimation'];
}> = [
  { label: 'None', value: 'none' },
  { label: 'Pulse', value: 'pulse' },
  { label: 'Flow', value: 'flow' },
  { label: 'Surge', value: 'surge' },
];
export const CANVAS_BACKGROUND_OPTIONS: Array<{
  label: string;
  preview: string;
  value: CanvasBackground;
}> = [
  { label: 'None', preview: 'none', value: 'none' },
  {
    label: 'Grid',
    preview:
      'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
    value: 'grid',
  },
  {
    label: 'Two-color gradient',
    preview: 'linear-gradient(180deg, currentColor, transparent)',
    value: 'gradient',
  },
  {
    label: 'Aurora shader',
    preview: 'linear-gradient(135deg, currentColor, transparent 70%)',
    value: 'aurora',
  },
  {
    label: 'Gradient mesh shader',
    preview:
      'radial-gradient(circle at 25% 25%, currentColor, transparent 60%), linear-gradient(135deg, currentColor, transparent)',
    value: 'gradient-mesh',
  },
  {
    label: 'Dot pattern',
    preview: 'radial-gradient(currentColor 1px, transparent 1px)',
    value: 'dot-pattern',
  },
  {
    label: 'Diagonal v3',
    preview: 'repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 8px)',
    value: 'pattern-diagonal',
  },
  {
    label: 'Polka Pin',
    preview: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
    value: 'pattern-polka-pin',
  },
  {
    label: 'Checkerboard',
    preview:
      'conic-gradient(currentColor 25%, transparent 0 50%, currentColor 0 75%, transparent 0)',
    value: 'pattern-checkerboard',
  },
  {
    label: 'Diamond grid',
    preview:
      'linear-gradient(45deg, transparent 42%, currentColor 42% 58%, transparent 58%), linear-gradient(-45deg, transparent 42%, currentColor 42% 58%, transparent 58%)',
    value: 'pattern-diamond',
  },
];
export const NODE_BORDER_OPTIONS: Array<{ label: string; value: NodeBorder }> = [
  { label: 'Solid', value: 'solid' },
  { label: 'Dashed', value: 'dashed' },
  { label: 'Dotted', value: 'dotted' },
  { label: 'None', value: 'none' },
];
export const NODE_SHAPE_OPTIONS: Array<{ label: string; value: NodeShape }> = [
  { label: 'Rectangle', value: 'rectangle' },
  { label: 'Square', value: 'square' },
  { label: 'Circle', value: 'circle' },
  { label: 'Diamond', value: 'diamond' },
  { label: 'Cylinder', value: 'cylinder' },
];
export const NODE_SHADOW_OPTIONS: Array<{ label: string; value: NodeShadow }> = [
  { label: 'None', value: 'none' },
  { label: 'Soft', value: 'soft' },
  { label: 'Strong', value: 'strong' },
];
export const GRADIENT_DIRECTION_OPTIONS: Array<{ label: string; value: GradientDirection }> = [
  { label: 'Vertical', value: 'vertical' },
  { label: 'Horizontal', value: 'horizontal' },
  { label: 'Radial', value: 'radial' },
];
export const NODE_SURFACE_OPTIONS: Array<{ label: string; preview: string; value: NodeSurface }> = [
  {
    label: 'Two-color gradient',
    preview: 'linear-gradient(180deg, currentColor, transparent)',
    value: 'gradient',
  },
  {
    label: 'Solid',
    preview: 'linear-gradient(135deg, currentColor, currentColor)',
    value: 'solid',
  },
  {
    label: 'Grid pattern',
    preview:
      'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
    value: 'pattern-grid',
  },
  {
    label: 'Dot pattern',
    preview: 'radial-gradient(currentColor 1px, transparent 1px)',
    value: 'pattern-dots',
  },
  {
    label: 'Diagonal v3',
    preview: 'repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 8px)',
    value: 'pattern-diagonal',
  },
  {
    label: 'Polka Pin',
    preview: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
    value: 'pattern-polka-pin',
  },
];
export const EDGE_TYPE_OPTIONS: Array<{
  label: string;
  value: GraphTranslationSettings['edgeType'];
}> = [
  { label: 'Default', value: 'default' },
  { label: 'Straight', value: 'straight' },
  { label: 'Step', value: 'step' },
  { label: 'Smooth step', value: 'smoothstep' },
];
export const EDGE_MARKER_OPTIONS: Array<{
  label: string;
  value: GraphTranslationSettings['edgeMarker'];
}> = [
  { label: 'None', value: 'none' },
  { label: 'Open arrow', value: 'arrow' },
  { label: 'Filled arrow', value: 'arrowclosed' },
];

export const EDGE_SELECTOR = '.edgePath, .flowchart-link';
export const NODE_ID_PATTERN = /(?:^|-)flowchart-(.+)-\d+$/;
export const EDGE_ID_PATTERN = /^L-(.+)-(.+)-\d+$/;
export const NODE_PATTERN_SIZE = 8;

export const SURGE_EDGE_TYPE = 'surge';
export const SEQUENCE_FRAME_TYPES = new Set(['alt', 'opt', 'rect']);
