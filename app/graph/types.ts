import { Schema } from 'effect';
import type { CSSProperties } from 'react';
import type { Edge, Node, Viewport } from 'reactflow';
import type Dexie from 'dexie';
import type { EntityTable } from 'dexie';

export type GraphInputFormat = 'mermaid';
export type GraphDiagramType =
  | 'flowchart'
  | 'sequence'
  | 'stateDiagram'
  | 'classDiagram'
  | 'er'
  | 'gantt';

export type GraphRenderErrorKind = 'invalid' | 'unsupported';

export class GraphRenderError extends Error {
  readonly diagramType?: string;
  readonly kind: GraphRenderErrorKind;

  constructor(kind: GraphRenderErrorKind, message: string, diagramType?: string) {
    super(message);
    this.name = 'GraphRenderError';
    this.diagramType = diagramType;
    this.kind = kind;
  }
}

export type CanvasBackground =
  | 'aurora'
  | 'dot-pattern'
  | 'gradient'
  | 'gradient-mesh'
  | 'grid'
  | 'none'
  | 'pattern-checkerboard'
  | 'pattern-diamond'
  | 'pattern-diagonal'
  | 'pattern-polka-pin';
export type GradientDirection = 'horizontal' | 'radial' | 'vertical';
export type GraphGradientSettings = {
  colorA: string;
  colorB: string;
  direction: GradientDirection;
  split: number;
};
export type GraphPatternSettings = {
  backgroundColor: string;
  color: string;
  density: number;
};
export type GraphShaderSettings = {
  aurora: {
    colorA: string;
    colorB: string;
    colorC: string;
  };
  gradientMesh: {
    colorA: string;
    colorB: string;
  };
};
export type NodeBorder = 'dashed' | 'dotted' | 'none' | 'solid';
export type NodeShape = 'circle' | 'cylinder' | 'diamond' | 'rectangle' | 'square';
export type NodeShadow = 'none' | 'soft' | 'strong';
export type NodeSurface =
  | 'gradient'
  | 'pattern-diagonal'
  | 'pattern-dots'
  | 'pattern-grid'
  | 'pattern-polka-pin'
  | 'solid';

export type FlowNodeRecord = { domId: string; id: string; label: string };

export type SequenceActivation = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type SequenceParticipantHandle = {
  id: string;
  sourceY: number;
  targetY: number;
};

export type SequenceParticipantRecord = {
  id: string;
  label: string;
  width: number;
  x: number;
};

export type SequenceMessagePoint = {
  sourceX: number;
  targetX: number;
  y: number;
};

export type SequenceMessageRecord = {
  actionId: string;
  dashed: boolean;
  id: string;
  label: string;
  markerEnd: boolean;
  markerStart: boolean;
  point: SequenceMessagePoint;
  sequenceNumber?: string;
  source: SequenceParticipantRecord;
  target: SequenceParticipantRecord;
};

export type SequenceNodeAppearance = {
  style: CSSProperties;
  styleVersion?: 1;
};

export type SequenceParticipantData = SequenceNodeAppearance & {
  activations: SequenceActivation[];
  handles: SequenceParticipantHandle[];
  kind: 'sequence-participant';
  label: string;
};

export type SequenceActionData = SequenceNodeAppearance & {
  kind: 'sequence-action';
  label: string;
  sequenceNumber?: string;
};

export type SequenceMessageData = {
  dashed: boolean;
  kind: 'sequence-message';
  markerEnd: boolean;
  markerStart: boolean;
  messageY: number;
  segment: 'source' | 'target';
  selfMessage: boolean;
  sequenceNumber?: string;
};

export type SequenceNoteData = SequenceNodeAppearance & {
  kind: 'sequence-note';
  label: string;
};

export type SequenceFrameSection = {
  label: string;
  y: number;
};

export type SequenceFrameData = SequenceNodeAppearance & {
  fill?: string;
  frameType: 'alt' | 'loop' | 'opt' | 'rect';
  kind: 'sequence-frame';
  label: string;
  sections: SequenceFrameSection[];
};

export type GraphElements = {
  edges: Edge[];
  nodes: Node[];
};

export type GraphRenderResult = {
  diagramType: GraphDiagramType;
  elements: GraphElements;
};

export type GraphTranslationSettings = {
  edgeAnimation: 'flow' | 'none' | 'pulse' | 'surge';
  edgeColor: string;
  edgeMarker: 'arrow' | 'arrowclosed' | 'none';
  edgeType: 'default' | 'smoothstep' | 'step' | 'straight';
  edgeWidth: number;
  fontFamily: string;
  inverseColor: string;
  nodeGradient: GraphGradientSettings;
  nodeBorder: NodeBorder;
  nodeShape: NodeShape;
  nodeShadow: NodeShadow;
  nodeSurface: NodeSurface;
  primaryColor: string;
};

export type GraphCanvasSettings = {
  background: CanvasBackground;
  gradient: GraphGradientSettings;
  pattern: GraphPatternSettings;
  shader: GraphShaderSettings;
  gridVisible: boolean;
  locked: boolean;
  snapToGrid: boolean;
};

export type GraphTranslationView = {
  canvas?: GraphCanvasSettings;
  selection?: {
    edgeIds: string[];
    nodeIds: string[];
  };
  viewport?: Viewport;
};

export type GraphWorkspace = {
  activeInputId: string | null;
  activeTranslationId: string | null;
  id: string;
  name: string;
  updatedAt: string;
};

export type GraphInput = {
  format: GraphInputFormat;
  id: string;
  source: string;
  updatedAt: string;
  version: number;
  workspaceId: string;
};

export type GraphVersion = Pick<GraphInput, 'id' | 'updatedAt' | 'version'>;

export type GraphTranslation = {
  diagramType?: GraphDiagramType;
  elements: GraphElements;
  error: string | null;
  id: string;
  inputId: string;
  settings: GraphTranslationSettings;
  updatedAt: string;
  view: GraphTranslationView;
};

export type GraphRecords = {
  input: GraphInput;
  translation: GraphTranslation;
  versions: GraphVersion[];
  workspace: GraphWorkspace;
};

export type CreateGraphRecordsInput = {
  input: Omit<GraphInput, 'id' | 'updatedAt' | 'version' | 'workspaceId'>;
  translation: Omit<GraphTranslation, 'id' | 'inputId' | 'updatedAt'>;
  workspace: {
    id?: string;
    name: string;
  };
};

export type UpdateGraphRecordsInput = {
  input: Pick<GraphInput, 'source'>;
  translation: Pick<GraphTranslation, 'elements' | 'error' | 'settings' | 'view'>;
  workspace: Pick<GraphWorkspace, 'id' | 'name'>;
};

export type GraphRepository = {
  create(records: CreateGraphRecordsInput): Promise<GraphRecords>;
  delete(workspaceId: string): Promise<void>;
  list(): Promise<GraphWorkspace[]>;
  read(workspaceId: string, versionId?: string): Promise<GraphRecords | null>;
  rename(workspaceId: string, name: string): Promise<GraphWorkspace>;
  update(records: UpdateGraphRecordsInput): Promise<GraphRecords>;
};

export type GraphDatabase = Dexie & {
  inputs: EntityTable<GraphInput, 'id'>;
  translations: EntityTable<GraphTranslation, 'id'>;
  workspaces: EntityTable<GraphWorkspace, 'id'>;
};

export type TranslationSettings = GraphTranslationSettings;
export type EdgeAnimation = TranslationSettings['edgeAnimation'];
export type EdgeMarkerValue = TranslationSettings['edgeMarker'];
export type EdgeType = TranslationSettings['edgeType'];

export const GraphPointSchema = Schema.Struct({ x: Schema.Finite, y: Schema.Finite });
export const GraphIdSchema = Schema.String.check(Schema.isNonEmpty());
export const GraphPositiveIntegerSchema = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
);
export const GraphEdgeTypeSchema = Schema.Literals(['default', 'smoothstep', 'step', 'straight']);

const graphCssString = Schema.String.check(
  Schema.isPattern(/^(?![^]*[\\;])(?![^]*(?:url\s*\(|image-set\s*\())[^]*$/i),
);
const graphCssValue = Schema.Union([graphCssString, Schema.Finite]);
const graphStyleValue = Schema.optional(graphCssValue);
const graphStyleString = Schema.optional(graphCssString);

export const GraphStyleSchema = Schema.Struct({
  '--m2rd-node-primary': graphStyleValue,
  '--m2rd-node-surface': graphStyleValue,
  '--m2rd-node-gradient-a': graphStyleValue,
  '--m2rd-node-gradient-b': graphStyleValue,
  '--m2rd-node-gradient-direction': graphStyleValue,
  '--m2rd-node-gradient-split': graphStyleValue,
  '--m2rd-node-shape': graphStyleValue,
  alignItems: graphStyleString,
  aspectRatio: graphStyleValue,
  backgroundColor: graphStyleString,
  backgroundImage: graphStyleString,
  backgroundSize: graphStyleValue,
  border: graphStyleValue,
  borderColor: graphStyleString,
  borderRadius: graphStyleValue,
  borderStyle: graphStyleString,
  borderWidth: graphStyleValue,
  boxShadow: graphStyleString,
  clipPath: graphStyleString,
  color: graphStyleString,
  display: Schema.optional(
    Schema.Literals(['flex', 'block', 'inline', 'inline-block', 'none', 'grid']),
  ),
  fontFamily: graphStyleString,
  fontSize: graphStyleValue,
  fontStyle: graphStyleString,
  fontWeight: graphStyleValue,
  height: graphStyleValue,
  justifyContent: graphStyleString,
  left: graphStyleValue,
  lineHeight: graphStyleValue,
  minHeight: graphStyleValue,
  minWidth: graphStyleValue,
  opacity: graphStyleValue,
  padding: graphStyleValue,
  position: Schema.optional(Schema.Literals(['absolute', 'relative', 'static', 'fixed', 'sticky'])),
  stroke: graphStyleString,
  strokeWidth: graphStyleValue,
  textAlign: Schema.optional(
    Schema.Literals(['left', 'right', 'center', 'start', 'end', 'justify']),
  ),
  textDecoration: graphStyleString,
  top: graphStyleValue,
  transform: graphStyleString,
  transformOrigin: graphStyleValue,
  whiteSpace: graphStyleString,
  width: graphStyleValue,
});

const GraphGradientSchema = Schema.Struct({
  colorA: graphCssString,
  colorB: graphCssString,
  direction: Schema.Literals(['horizontal', 'radial', 'vertical']),
  split: Schema.Finite,
});

export const GraphSettingsSchema = Schema.Struct({
  edgeAnimation: Schema.Literals(['flow', 'none', 'pulse', 'surge']),
  edgeColor: graphCssString,
  edgeMarker: Schema.Literals(['arrow', 'arrowclosed', 'none']),
  edgeType: GraphEdgeTypeSchema,
  edgeWidth: Schema.Finite,
  fontFamily: graphCssString,
  inverseColor: graphCssString,
  nodeGradient: GraphGradientSchema,
  nodeBorder: Schema.Literals(['dashed', 'dotted', 'none', 'solid']),
  nodeShape: Schema.Literals(['circle', 'cylinder', 'diamond', 'rectangle', 'square']),
  nodeShadow: Schema.Literals(['none', 'soft', 'strong']),
  nodeSurface: Schema.Literals([
    'gradient',
    'pattern-diagonal',
    'pattern-dots',
    'pattern-grid',
    'pattern-polka-pin',
    'solid',
  ]),
  primaryColor: graphCssString,
});

const GraphCanvasSchema = Schema.Struct({
  background: Schema.Literals([
    'aurora',
    'dot-pattern',
    'gradient',
    'gradient-mesh',
    'grid',
    'none',
    'pattern-checkerboard',
    'pattern-diamond',
    'pattern-diagonal',
    'pattern-polka-pin',
  ]),
  gradient: GraphGradientSchema,
  pattern: Schema.Struct({
    backgroundColor: graphCssString,
    color: graphCssString,
    density: Schema.Finite,
  }),
  shader: Schema.Struct({
    aurora: Schema.Struct({
      colorA: graphCssString,
      colorB: graphCssString,
      colorC: graphCssString,
    }),
    gradientMesh: Schema.Struct({ colorA: graphCssString, colorB: graphCssString }),
  }),
  gridVisible: Schema.Boolean,
  locked: Schema.Boolean,
  snapToGrid: Schema.Boolean,
});

export const GraphViewSchema = Schema.Struct({
  canvas: Schema.optional(GraphCanvasSchema),
  selection: Schema.optional(
    Schema.Struct({
      edgeIds: Schema.mutable(Schema.Array(GraphIdSchema)),
      nodeIds: Schema.mutable(Schema.Array(GraphIdSchema)),
    }),
  ),
  viewport: Schema.optional(
    Schema.Struct({
      ...GraphPointSchema.fields,
      zoom: Schema.Finite.check(Schema.isGreaterThan(0)),
    }),
  ),
});

export const GraphInputSchema = Schema.Struct({
  format: Schema.Literal('mermaid'),
  id: GraphIdSchema,
  source: Schema.String,
  updatedAt: Schema.String,
  version: GraphPositiveIntegerSchema,
  workspaceId: GraphIdSchema,
});

export const GraphWorkspaceSchema = Schema.Struct({
  activeInputId: Schema.NullOr(GraphIdSchema),
  activeTranslationId: Schema.NullOr(GraphIdSchema),
  id: GraphIdSchema,
  name: Schema.String,
  updatedAt: Schema.String,
});
