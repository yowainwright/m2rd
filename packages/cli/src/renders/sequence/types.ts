export interface SequenceParticipant {
  id: string;
  label: string;
  x: number;
}

export interface SequenceMessage {
  id: string;
  label: string;
  from: string;
  to: string;
  y: number;
  dashed: boolean;
  arrowStart: boolean;
  arrowEnd: boolean;
}

export interface SequenceSection {
  y: number;
  label: string;
}

export interface SequenceFrame {
  id: string;
  label: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
  sections: SequenceSection[];
}

export interface SequenceGraph {
  participants: SequenceParticipant[];
  messages: SequenceMessage[];
  frames: SequenceFrame[];
}

export interface ParticipantColumn extends SequenceParticipant {
  left: number;
  center: number;
  width: number;
}

export interface FrameColumn extends SequenceFrame {
  column: number;
  width: number;
}

export interface SequenceRow {
  id: string;
  y: number;
  label: string;
  message?: SequenceMessage;
}

export interface PositionedRow extends SequenceRow {
  top: number;
  height: number;
  labelHeight: number;
  left: number;
  width: number;
  containerLeft: number;
  containerWidth: number;
}

export interface SequenceLayout {
  columns: ParticipantColumn[];
  frames: FrameColumn[];
  rows: PositionedRow[];
  header: number;
  height: number;
}
