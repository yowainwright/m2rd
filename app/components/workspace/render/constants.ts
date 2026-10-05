import { SURGE_EDGE_TYPES } from '@/app/components/diagrams/edges';
import { StateDiagramNode, StateTransitionEdge } from '@/app/components/diagrams/state';
import { STATE_EDGE_TYPE, STATE_NODE_TYPE } from '@/app/graph/state/constants';
import { ClassDiagramNode, ClassRelationEdge } from '@/app/components/diagrams/class';
import { CLASS_EDGE_TYPE, CLASS_NODE_TYPE } from '@/app/graph/class/constants';
import { ErDiagramNode, ErRelationEdge } from '@/app/components/diagrams/er';
import { ER_EDGE_TYPE, ER_NODE_TYPE } from '@/app/graph/er/constants';
import { GanttDiagramNode } from '@/app/components/diagrams/gantt';
import { GANTT_FRAME_TYPE, GANTT_TASK_TYPE } from '@/app/graph/gantt/constants';
import {
  SequenceActionNode,
  SequenceFrameNode,
  SequenceMessageEdge,
  SequenceNoteNode,
  SequenceParticipantNode,
} from '@/app/components/diagrams/sequence';
import {
  SEQUENCE_ACTION_NODE_TYPE,
  SEQUENCE_FRAME_NODE_TYPE,
  SEQUENCE_MESSAGE_EDGE_TYPE,
  SEQUENCE_NOTE_NODE_TYPE,
  SEQUENCE_PARTICIPANT_NODE_TYPE,
} from '@/app/graph/constants';

export const RENDER_LABELS = {
  output: 'React Flow output',
  back: 'Prev',
  forward: 'Redo',
  recenter: 'Re-center',
  resetLayout: 'Reset layout',
  nodeSelected: 'Node selected',
  edgeSelected: 'Edge selected',
};
export const RENDER_PRO_OPTIONS = { hideAttribution: true };
export const RENDER_MIN_ZOOM = 0.1;

export const RENDER_EDGE_TYPES = Object.assign({}, SURGE_EDGE_TYPES, {
  [ER_EDGE_TYPE]: ErRelationEdge,
  [CLASS_EDGE_TYPE]: ClassRelationEdge,
  [STATE_EDGE_TYPE]: StateTransitionEdge,
  [SEQUENCE_MESSAGE_EDGE_TYPE]: SequenceMessageEdge,
});
export const RENDER_NODE_TYPES = {
  [GANTT_FRAME_TYPE]: GanttDiagramNode,
  [GANTT_TASK_TYPE]: GanttDiagramNode,
  [ER_NODE_TYPE]: ErDiagramNode,
  [CLASS_NODE_TYPE]: ClassDiagramNode,
  [STATE_NODE_TYPE]: StateDiagramNode,
  [SEQUENCE_ACTION_NODE_TYPE]: SequenceActionNode,
  [SEQUENCE_FRAME_NODE_TYPE]: SequenceFrameNode,
  [SEQUENCE_NOTE_NODE_TYPE]: SequenceNoteNode,
  [SEQUENCE_PARTICIPANT_NODE_TYPE]: SequenceParticipantNode,
};
