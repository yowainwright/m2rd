import { Schema } from 'effect';
import { MarkerType, Position } from 'reactflow';
import { ClassEdgeDataSchema, ClassNodeDataSchema } from '../class/types';
import { CLASS_EDGE_TYPE, CLASS_NODE_TYPE } from '../class/constants';
import {
  GRAPH_DIAGRAM_TYPES,
  SEQUENCE_ACTION_NODE_TYPE,
  SEQUENCE_FRAME_NODE_TYPE,
  SEQUENCE_MESSAGE_EDGE_TYPE,
  SEQUENCE_NOTE_NODE_TYPE,
  SEQUENCE_PARTICIPANT_NODE_TYPE,
  SURGE_EDGE_TYPE,
} from '../constants';
import { ER_EDGE_TYPE, ER_NODE_TYPE } from '../er/constants';
import { ErEdgeDataSchema, ErNodeDataSchema } from '../er/types';
import { GANTT_FRAME_TYPE, GANTT_TASK_TYPE } from '../gantt/constants';
import { GanttNodeDataSchema } from '../gantt/types';
import {
  SequenceActionDataSchema,
  SequenceFrameDataSchema,
  SequenceMessageDataSchema,
  SequenceNoteDataSchema,
  SequenceParticipantDataSchema,
} from '../sequence/types';
import { STATE_EDGE_TYPE, STATE_NODE_TYPE } from '../state/constants';
import { StateEdgeDataSchema, StateNodeDataSchema } from '../state/types';
import {
  GraphEdgeTypeSchema,
  GraphIdSchema,
  GraphInputSchema,
  GraphPointSchema,
  GraphPositiveIntegerSchema,
  GraphSettingsSchema,
  GraphStyleSchema,
  GraphViewSchema,
  GraphWorkspaceSchema,
} from '../types';

export const MAX_SOURCE_BYTES = 32_768;
export const MAX_SNAPSHOT_BYTES = 1_048_576;
export const MAX_SVG_BYTES = 524_288;
export const SNAPSHOT_ORIGIN = 'https://jeffry.in';
export const SNAPSHOT_PATH = /^\/m2rd\/([a-f\d]+)-([a-f\d]{40})$/i;
export const SNAPSHOT_FILE = /^m2rd-(\d{10})-([a-f\d-]{36})\.json$/i;
export const SnapshotSaveIdSchema = Schema.String.check(Schema.isUUID());
export const SnapshotGistIdSchema = Schema.String.check(Schema.isPattern(/^[a-f\d]+$/i));
export const SnapshotRevisionSchema = Schema.String.check(Schema.isPattern(/^[a-f\d]{40}$/i));

const OptionalString = Schema.optional(Schema.String);
const OptionalBoolean = Schema.optional(Schema.Boolean);
const OptionalFinite = Schema.optional(Schema.Finite);
const OptionalStyle = Schema.optional(GraphStyleSchema);
const CoordinatePair = Schema.mutable(Schema.Tuple([Schema.Finite, Schema.Finite]));
const CoordinateExtent = Schema.mutable(Schema.Tuple([CoordinatePair, CoordinatePair]));
const NodePosition = Schema.optional(Schema.Enum(Position));

const nodeFields = {
  id: GraphIdSchema,
  position: GraphPointSchema,
  positionAbsolute: Schema.optional(GraphPointSchema),
  parentId: Schema.optional(GraphIdSchema),
  parentNode: Schema.optional(GraphIdSchema),
  extent: Schema.optional(Schema.Union([Schema.Literal('parent'), CoordinateExtent])),
  expandParent: OptionalBoolean,
  sourcePosition: NodePosition,
  targetPosition: NodePosition,
  style: OptionalStyle,
  className: OptionalString,
  ariaLabel: OptionalString,
  dragHandle: OptionalString,
  selected: OptionalBoolean,
  dragging: OptionalBoolean,
  draggable: OptionalBoolean,
  selectable: OptionalBoolean,
  connectable: OptionalBoolean,
  deletable: OptionalBoolean,
  hidden: OptionalBoolean,
  focusable: OptionalBoolean,
  resizing: OptionalBoolean,
  width: Schema.optional(Schema.NullOr(Schema.Finite)),
  height: Schema.optional(Schema.NullOr(Schema.Finite)),
  zIndex: OptionalFinite,
};

const SnapshotNodeSchema = Schema.Union([
  Schema.Struct({
    ...nodeFields,
    type: Schema.optional(Schema.Literal('default')),
    data: Schema.Struct({ label: Schema.String }),
  }),
  Schema.Struct({
    ...nodeFields,
    type: Schema.Literal(SEQUENCE_PARTICIPANT_NODE_TYPE),
    data: SequenceParticipantDataSchema,
  }),
  Schema.Struct({
    ...nodeFields,
    type: Schema.Literal(SEQUENCE_ACTION_NODE_TYPE),
    data: SequenceActionDataSchema,
  }),
  Schema.Struct({
    ...nodeFields,
    type: Schema.Literal(SEQUENCE_NOTE_NODE_TYPE),
    data: SequenceNoteDataSchema,
  }),
  Schema.Struct({
    ...nodeFields,
    type: Schema.Literal(SEQUENCE_FRAME_NODE_TYPE),
    data: SequenceFrameDataSchema,
  }),
  Schema.Struct({
    ...nodeFields,
    type: Schema.Literal(STATE_NODE_TYPE),
    data: StateNodeDataSchema,
  }),
  Schema.Struct({
    ...nodeFields,
    type: Schema.Literal(CLASS_NODE_TYPE),
    data: ClassNodeDataSchema,
  }),
  Schema.Struct({ ...nodeFields, type: Schema.Literal(ER_NODE_TYPE), data: ErNodeDataSchema }),
  Schema.Struct({
    ...nodeFields,
    type: Schema.Literals([GANTT_TASK_TYPE, GANTT_FRAME_TYPE]),
    data: GanttNodeDataSchema,
  }),
]);

const MarkerSchema = Schema.optional(
  Schema.Union([
    Schema.String.check(Schema.isPattern(/^#?[\w:.-]+$/)),
    Schema.Struct({
      type: Schema.Enum(MarkerType),
      color: OptionalString,
      height: OptionalFinite,
      width: OptionalFinite,
      markerUnits: OptionalString,
      orient: OptionalString,
      strokeWidth: OptionalFinite,
    }),
  ]),
);
const OptionalHandleId = Schema.optional(Schema.NullOr(GraphIdSchema));
const EdgeUpdatable = Schema.optional(
  Schema.Union([Schema.Boolean, Schema.Literals(['source', 'target'])]),
);
const edgeFields = {
  id: GraphIdSchema,
  source: GraphIdSchema,
  target: GraphIdSchema,
  sourceHandle: OptionalHandleId,
  targetHandle: OptionalHandleId,
  label: OptionalString,
  labelStyle: OptionalStyle,
  labelBgStyle: OptionalStyle,
  labelShowBg: OptionalBoolean,
  labelBgPadding: Schema.optional(CoordinatePair),
  labelBgBorderRadius: OptionalFinite,
  style: OptionalStyle,
  markerStart: MarkerSchema,
  markerEnd: MarkerSchema,
  animated: OptionalBoolean,
  className: OptionalString,
  ariaLabel: OptionalString,
  selected: OptionalBoolean,
  hidden: OptionalBoolean,
  deletable: OptionalBoolean,
  focusable: OptionalBoolean,
  interactionWidth: OptionalFinite,
  zIndex: OptionalFinite,
  updatable: EdgeUpdatable,
  reconnectable: EdgeUpdatable,
  pathOptions: Schema.optional(
    Schema.Struct({
      borderRadius: OptionalFinite,
      offset: OptionalFinite,
      curvature: OptionalFinite,
    }),
  ),
};
const SnapshotEdgeSchema = Schema.Union([
  Schema.Struct({
    ...edgeFields,
    type: Schema.optional(Schema.Union([GraphEdgeTypeSchema, Schema.Literal(SURGE_EDGE_TYPE)])),
    data: Schema.optional(Schema.Struct({ edgeType: Schema.optional(GraphEdgeTypeSchema) })),
  }),
  Schema.Struct({
    ...edgeFields,
    type: Schema.Literals([SEQUENCE_MESSAGE_EDGE_TYPE, SURGE_EDGE_TYPE]),
    data: SequenceMessageDataSchema,
  }),
  Schema.Struct({
    ...edgeFields,
    type: Schema.Literal(STATE_EDGE_TYPE),
    data: StateEdgeDataSchema,
  }),
  Schema.Struct({
    ...edgeFields,
    type: Schema.Literal(CLASS_EDGE_TYPE),
    data: ClassEdgeDataSchema,
  }),
  Schema.Struct({ ...edgeFields, type: Schema.Literal(ER_EDGE_TYPE), data: ErEdgeDataSchema }),
]);

export const SnapshotProvenanceSchema = Schema.Struct({
  gistId: SnapshotGistIdSchema,
  revision: SnapshotRevisionSchema,
  fileName: Schema.String.check(Schema.isPattern(SNAPSHOT_FILE)),
});

export const SnapshotElementsSchema = Schema.Struct({
  nodes: Schema.mutable(Schema.Array(SnapshotNodeSchema)),
  edges: Schema.mutable(Schema.Array(SnapshotEdgeSchema)),
});

export const SnapshotRecordsSchema = Schema.Struct({
  input: GraphInputSchema,
  translation: Schema.Struct({
    id: GraphIdSchema,
    inputId: GraphIdSchema,
    diagramType: Schema.optional(Schema.Literals(GRAPH_DIAGRAM_TYPES)),
    elements: SnapshotElementsSchema,
    error: Schema.NullOr(Schema.String),
    settings: GraphSettingsSchema,
    updatedAt: Schema.String,
    view: GraphViewSchema,
  }),
  workspace: GraphWorkspaceSchema,
});

export const SnapshotSchema = Schema.Struct({
  format: Schema.Literal('m2rd.snapshot'),
  schemaVersion: Schema.Literal(1),
  saveId: SnapshotSaveIdSchema,
  ordinal: GraphPositiveIntegerSchema,
  records: SnapshotRecordsSchema,
  svg: Schema.Struct({ mimeType: Schema.Literal('image/svg+xml'), text: Schema.String }),
  forkedFrom: Schema.optional(SnapshotProvenanceSchema),
});
