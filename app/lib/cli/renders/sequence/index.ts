import { createElement, type ReactNode } from 'react';
import { Box, Text, renderToString } from 'ink';
import { Array as EffectArray, Effect } from 'effect';
import stringWidth from 'string-width';
import { Panel } from '@/app/components/ui/panel';
import { UnicodeContext } from '@/app/hooks/useUnicode';
import { MAX_RENDER_CELLS } from '../../constants';
import { errorMessage } from '../../utils';
import type { CliOptions, RenderedMermaid } from '../../types';
import {
  DASHED_LINE,
  HEADER_GAP,
  MIN_COLUMN_WIDTH,
  SEQUENCE_MARGIN,
  SOLID_LINE,
} from './constants';
import { readSequence, sequenceRows } from './utils';
import type {
  FrameColumn,
  ParticipantColumn,
  PositionedRow,
  SequenceFrame,
  SequenceGraph,
  SequenceLayout,
  SequenceMessage,
  SequenceRow,
} from './types';

const participantPanel = (column: ParticipantColumn, ascii: boolean, height?: number) => {
  const borderStyle = ascii ? 'classic' : 'single';
  const label = createElement(Text, null, column.label);
  return createElement(
    Panel,
    { width: column.width, height, borderStyle, borderColor: 'cyan' },
    label,
  );
};

const participantColumns = (graph: SequenceGraph, width: number): ParticipantColumn[] => {
  const lane = Math.floor((width - SEQUENCE_MARGIN * 2) / graph.participants.length);
  if (lane < MIN_COLUMN_WIDTH)
    throw new Error('Too many sequence participants for this width. Increase --width.');
  return graph.participants.map((participant, index) => {
    const left = SEQUENCE_MARGIN + index * lane + 1;
    const width = lane - 2;
    const center = left + Math.floor(width / 2);
    return Object.assign({}, participant, { left, width, center });
  });
};

const frameColumn = (
  frame: SequenceFrame,
  columns: ParticipantColumn[],
  frames: SequenceFrame[],
): FrameColumn => {
  const participants = columns.filter(
    (column) => column.x >= frame.left && column.x <= frame.right,
  );
  if (!participants.length) throw new Error(`Missing participants for ${frame.label}.`);
  const parents = frames.filter((parent) => parent.top < frame.top && parent.bottom > frame.bottom);
  const inset = Math.min(parents.length, 2);
  const last = participants[participants.length - 1];
  const column = participants[0].left - 2 + inset;
  const width = last.left + last.width + 2 - inset - column;
  return Object.assign({}, frame, { column, width });
};

const textHeight = (label: string, width: number) => {
  if (!label) return 0;
  const text = createElement(Text, null, label);
  const box = createElement(Box, { width }, text);
  return renderToString(box, { columns: width }).split('\n').length;
};

const labelSlots = (left: number, width: number, columns: ParticipantColumn[]) => {
  const right = left + width;
  const centers = columns
    .map((column) => column.center)
    .filter((center) => center >= left && center < right);
  const boundaries = [left - 2].concat(centers, [right + 1]);
  return boundaries
    .slice(1)
    .map((end, index) => {
      const start = boundaries[index];
      const left = start + 2;
      const width = end - start - 3;
      return { left, width };
    })
    .filter((slot) => slot.width > 0);
};

const labelSlot = (row: SequenceRow, left: number, width: number, columns: ParticipantColumn[]) => {
  const slots = labelSlots(left, width, columns);
  const byId = new Map(columns.map((column) => [column.id, column]));
  const source = byId.get(row.message?.from || '');
  const target = byId.get(row.message?.to || '');
  const anchor = source && target ? Math.min(source.center, target.center) + 2 : undefined;
  const preferred = slots.find((slot) => slot.left === anchor);
  if (preferred) return preferred;
  const widest = slots.toSorted((first, second) => second.width - first.width)[0];
  if (!widest) throw new Error('Sequence captions need more space. Increase --width.');
  return widest;
};

const rowDimensions = (
  row: SequenceRow,
  frames: FrameColumn[],
  width: number,
  columns: ParticipantColumn[],
) => {
  const containing = frames.filter((frame) => frame.top <= row.y && frame.bottom >= row.y);
  const frame = containing.at(-1);
  const containerLeft = frame ? frame.column + 2 : SEQUENCE_MARGIN;
  const containerWidth = frame ? frame.width - 4 : width - SEQUENCE_MARGIN * 2;
  const slot = labelSlot(row, containerLeft, containerWidth, columns);
  const labelHeight = textHeight(row.label, slot.width);
  const self = row.message && row.message.from === row.message.to;
  const arrowHeight = self ? 3 : 1;
  const gap = row.label ? 1 : 0;
  const height = labelHeight + arrowHeight + gap;
  return Object.assign({}, slot, { labelHeight, height, containerLeft, containerWidth });
};

const positionRows = ({
  graph,
  frames,
  width,
  header,
  columns,
}: {
  graph: SequenceGraph;
  frames: FrameColumn[];
  width: number;
  header: number;
  columns: ParticipantColumn[];
}) => {
  const measured = sequenceRows(graph).map((row) => {
    const dimensions = rowDimensions(row, frames, width, columns);
    return Object.assign({}, row, dimensions);
  });
  const offsets = EffectArray.scan(measured, header + HEADER_GAP, (top, row) => top + row.height);
  return measured.map((row, index): PositionedRow => {
    const top = offsets[index];
    return Object.assign({}, row, { top });
  });
};

const positionedPanel = (column: ParticipantColumn, ascii: boolean, height: number) => {
  const panel = participantPanel(column, ascii, height);
  return createElement(
    Box,
    { key: column.id, position: 'absolute', top: 0, left: column.left },
    panel,
  );
};

const participantJunction = (column: ParticipantColumn, ascii: boolean, height: number) => {
  const glyph = ascii ? '+' : '┬';
  const text = createElement(Text, { color: 'cyan' }, glyph);
  const top = height - 1;
  return createElement(
    Box,
    { key: `join-${column.id}`, position: 'absolute', top, left: column.center },
    text,
  );
};

const positionedFrame = (frame: FrameColumn, rows: Map<string, PositionedRow>, ascii: boolean) => {
  const start = rows.get(`${frame.id}:start`);
  const end = rows.get(`${frame.id}:end`);
  const missingBoundary = !start || !end;
  if (missingBoundary) throw new Error(`Missing frame boundary for ${frame.id}.`);
  const top = start.top;
  const height = end.top - top + 1;
  const borderStyle = ascii ? 'classic' : 'single';
  const panel = createElement(Panel, {
    width: frame.width,
    height,
    borderStyle,
    borderColor: 'yellow',
  });
  return createElement(
    Box,
    { key: frame.id, position: 'absolute', top, left: frame.column },
    panel,
  );
};

const frameCrossings = (
  column: ParticipantColumn,
  frames: FrameColumn[],
  rows: Map<string, PositionedRow>,
) => {
  const containing = frames.filter(
    (frame) => column.center > frame.column && column.center < frame.column + frame.width - 1,
  );
  const boundaries = containing.flatMap((frame) => [
    rows.get(`${frame.id}:start`)?.top,
    rows.get(`${frame.id}:end`)?.top,
  ]);
  return new Set(boundaries);
};

const lifeline = ({
  column,
  top,
  height,
  crossings,
  ascii,
}: {
  column: ParticipantColumn;
  top: number;
  height: number;
  crossings: Set<number | undefined>;
  ascii: boolean;
}) => {
  const vertical = ascii ? '|' : '│';
  const crossing = ascii ? '+' : '┼';
  const lines = Array.from({ length: height - top }, (_, index) => {
    const y = top + index;
    return crossings.has(y) ? crossing : vertical;
  });
  const text = createElement(Text, { dimColor: true }, lines.join('\n'));
  return createElement(
    Box,
    { key: `line-${column.id}`, position: 'absolute', top, left: column.center, width: 1 },
    text,
  );
};

const messageStroke = (message: SequenceMessage, ascii: boolean) => {
  if (message.dashed) return ascii ? '.' : DASHED_LINE;
  return ascii ? '-' : SOLID_LINE;
};

const messageLine = ({
  message,
  source,
  target,
  centers,
  ascii,
}: {
  message: SequenceMessage;
  source: number;
  target: number;
  centers: Set<number>;
  ascii: boolean;
}) => {
  const right = ascii ? '>' : '▶';
  const left = ascii ? '<' : '◀';
  const stroke = messageStroke(message, ascii);
  const forward = source < target;
  const startArrow = forward ? left : right;
  const endArrow = forward ? right : left;
  const sourceJoin = forward ? '├' : '┤';
  const targetJoin = forward ? '┤' : '├';
  const startJoin = ascii ? '+' : sourceJoin;
  const endJoin = ascii ? '+' : targetJoin;
  const start = message.arrowStart ? startArrow : startJoin;
  const end = message.arrowEnd ? endArrow : endJoin;
  const length = Math.max(0, Math.abs(target - source) - 1);
  const crossing = ascii ? '+' : '┼';
  const body = Array.from({ length }, (_, index) => {
    const x = Math.min(source, target) + index + 1;
    return centers.has(x) ? crossing : stroke;
  }).join('');
  return forward ? `${start}${body}${end}` : `${end}${body}${start}`;
};

const selfMessage = (message: SequenceMessage, ascii: boolean) => {
  const stroke = messageStroke(message, ascii);
  const tip = ascii ? '<' : '◀';
  const junction = ascii ? '+' : '├';
  const end = message.arrowEnd ? tip : junction;
  const top = ascii ? '+' : '┐';
  const bottom = ascii ? '+' : '┘';
  const vertical = ascii ? '|' : '│';
  const start = message.arrowStart ? tip : junction;
  return `${start}${stroke.repeat(2)}${top}\n${vertical}  ${vertical}\n${end}${stroke.repeat(2)}${bottom}`;
};

const positionedMessage = (
  row: PositionedRow,
  columns: Map<string, ParticipantColumn>,
  ascii: boolean,
) => {
  const message = row.message;
  if (!message) return null;
  const source = columns.get(message.from);
  const target = columns.get(message.to);
  const missingParticipant = !source || !target;
  if (missingParticipant) throw new Error(`Missing participant for ${message.id}.`);
  const self = source.id === target.id;
  const centers = new Set(Array.from(columns.values(), (column) => column.center));
  const line = self
    ? selfMessage(message, ascii)
    : messageLine({ message, source: source.center, target: target.center, centers, ascii });
  const left = Math.min(source.center, target.center);
  const top = row.top + row.labelHeight;
  const text = createElement(Text, null, line);
  return createElement(Box, { key: message.id, position: 'absolute', top, left }, text);
};

const positionedLabel = (row: PositionedRow) => {
  if (!row.label) return null;
  const color = row.message ? undefined : 'yellow';
  const bold = !row.message;
  const text = createElement(Text, { color, bold }, row.label);
  const top = row.message ? row.top : row.top + 1;
  return createElement(
    Box,
    { key: `label-${row.id}`, position: 'absolute', top, left: row.left, width: row.width },
    text,
  );
};

const sectionDivider = (row: PositionedRow, columns: ParticipantColumn[], ascii: boolean) => {
  if (!row.id.includes(':section-')) return null;
  const stroke = ascii ? '-' : DASHED_LINE;
  const left = row.containerLeft - 1;
  const centers = new Set(columns.map((column) => column.center));
  const crossing = ascii ? '+' : '┼';
  const glyphs = Array.from({ length: row.containerWidth + 2 }, (_, index) =>
    centers.has(left + index) ? crossing : stroke,
  );
  const text = createElement(Text, { color: 'yellow' }, glyphs.join(''));
  return createElement(
    Box,
    { key: `divider-${row.id}`, position: 'absolute', top: row.top, left },
    text,
  );
};

const layoutSequence = (graph: SequenceGraph, options: CliOptions): SequenceLayout => {
  const columns = participantColumns(graph, options.width);
  const frames = graph.frames.map((frame) => frameColumn(frame, columns, graph.frames));
  const headers = columns.map(
    (column) =>
      renderToString(participantPanel(column, options.ascii), { columns: column.width }).split('\n')
        .length,
  );
  const header = Math.max(...headers);
  const rows = positionRows({ graph, frames, width: options.width, header, columns });
  const last = rows.at(-1);
  const height = last ? last.top + last.height : header;
  if (height * options.width > MAX_RENDER_CELLS)
    throw new Error('Sequence is too large to render.');
  return { columns, frames, rows, header, height };
};

const sequenceElements = (layout: SequenceLayout, ascii: boolean) => {
  const { columns, frames, rows, header, height } = layout;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const participants = new Map(columns.map((column) => [column.id, column]));
  const panels: ReactNode[] = frames.map((frame) => positionedFrame(frame, byId, ascii));
  const lines = columns.map((column) =>
    lifeline({
      column,
      top: header,
      height,
      crossings: frameCrossings(column, frames, byId),
      ascii,
    }),
  );
  const headings = columns.map((column) => positionedPanel(column, ascii, header));
  const junctions = columns.map((column) => participantJunction(column, ascii, header));
  const labels = rows.map(positionedLabel);
  const arrows = rows.map((row) => positionedMessage(row, participants, ascii));
  const dividers = rows.map((row) => sectionDivider(row, columns, ascii));
  return panels.concat(lines, headings, junctions, labels, arrows, dividers);
};

const sequenceWidth = (graph: SequenceGraph, requested: number) => {
  const labels = graph.participants.flatMap((participant) => participant.label.split('\n'));
  const widths = labels.map((label) => stringWidth(label) + SEQUENCE_MARGIN * 2);
  const lane = Math.max(MIN_COLUMN_WIDTH, ...widths);
  const minimum = graph.participants.length * lane + SEQUENCE_MARGIN * 2;
  return Math.max(requested, minimum);
};

const checkHeaderSize = (graph: SequenceGraph, width: number) => {
  const heights = graph.participants.map((participant) => participant.label.split('\n').length + 2);
  const height = Math.max(...heights);
  if (height * width > MAX_RENDER_CELLS) throw new Error('Sequence is too large to render.');
};

const drawSequence = (graph: SequenceGraph, options: CliOptions) => {
  const width = sequenceWidth(graph, options.width);
  checkHeaderSize(graph, width);
  const layoutOptions = Object.assign({}, options, { width });
  const layout = layoutSequence(graph, layoutOptions);
  const children = sequenceElements(layout, options.ascii);
  const canvas = createElement(
    Box,
    { position: 'relative', width, height: layout.height },
    children,
  );
  const value = { unicode: !options.ascii };
  const tree = createElement(UnicodeContext.Provider, { value }, canvas);
  return renderToString(tree, { columns: width });
};

export const renderSequence = (diagram: RenderedMermaid, options: CliOptions) =>
  Effect.try({ try: () => drawSequence(readSequence(diagram.svg), options), catch: errorMessage });
