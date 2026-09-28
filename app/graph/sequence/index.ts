import { Array as EffectArray } from 'effect';
import { Position, type Edge, type Node } from 'reactflow';
import {
  SEQUENCE_ACTION_NODE_HEIGHT,
  SEQUENCE_ACTION_NODE_MIN_WIDTH,
  SEQUENCE_ACTOR_FIGURE_WIDTH,
  SEQUENCE_ACTION_NODE_TYPE,
  SEQUENCE_FRAME_NODE_TYPE,
  SEQUENCE_MESSAGE_EDGE_TYPE,
  SEQUENCE_NOTE_NODE_TYPE,
  SEQUENCE_PARTICIPANT_NODE_TYPE,
  SEQUENCE_SELF_MESSAGE_HEIGHT,
  SEQUENCE_SELF_MESSAGE_OFFSET,
  SEQUENCE_FRAME_TYPES,
} from '../constants';
import type {
  GraphElements,
  SequenceActionData,
  SequenceActivation,
  SequenceFrameData,
  SequenceMessageData,
  SequenceMessageRecord,
  SequenceMessagePoint,
  SequenceNoteData,
  SequenceParticipantData,
  SequenceParticipantHandle,
  SequenceParticipantRecord,
  TranslationSettings,
} from '../types';
import type { SequenceBounds, SequenceFrameRecord } from './types';
import { createSequenceStyle, createEdgeStyle, createEdgeMarker } from '../utils';
import { getText } from '../svg/utils';

const getNumericAttribute = (element: Element, name: string, fallback: number) => {
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) ? value : fallback;
};

const getSequenceHeight = (svg: SVGSVGElement) => {
  const values = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
  const height = values[3];
  const hasHeight = Number.isFinite(height) && height > 0;
  if (hasHeight) return height;
  return 320;
};

const readSequenceLifeLines = (svg: SVGSVGElement) => {
  const lines = Array.from(svg.querySelectorAll('line[data-et="life-line"]'));
  return new Map(lines.map((line) => [line.getAttribute('data-id') || '', line]));
};

const readSequenceParticipants = (svg: SVGSVGElement) => {
  const lifeLines = readSequenceLifeLines(svg);
  return Array.from(svg.querySelectorAll('[data-et="participant"]'))
    .map((participant): SequenceParticipantRecord | null => {
      const id = participant.getAttribute('data-id');
      const rect = participant.querySelector('rect.actor-top');
      if (!id) return null;
      const lifeLine = lifeLines.get(id);
      const hasGeometry = Boolean(rect) || Boolean(lifeLine);
      if (!hasGeometry) return null;
      const label = getText(participant, 'text') || id;
      const width = rect ? getNumericAttribute(rect, 'width', 150) : SEQUENCE_ACTOR_FIGURE_WIDTH;
      const lineCenter = lifeLine ? getNumericAttribute(lifeLine, 'x1', 0) : 0;
      const center = rect ? getNumericAttribute(rect, 'x', 0) + width / 2 : lineCenter;
      const x = rect ? getNumericAttribute(rect, 'x', 0) : center - width / 2;
      return { id, label, width, x };
    })
    .filter((participant): participant is SequenceParticipantRecord => participant !== null)
    .sort((first, second) => first.x - second.x);
};

const readSequenceBounds = (lines: Element[]): SequenceBounds | null => {
  if (lines.length === 0) return null;
  const xValues = lines.flatMap((line) => [
    getNumericAttribute(line, 'x1', 0),
    getNumericAttribute(line, 'x2', 0),
  ]);
  const yValues = lines.flatMap((line) => [
    getNumericAttribute(line, 'y1', 0),
    getNumericAttribute(line, 'y2', 0),
  ]);
  const x = Math.min(...xValues);
  const y = Math.min(...yValues);
  return { height: Math.max(...yValues) - y, width: Math.max(...xValues) - x, x, y };
};

const getSequenceFrameType = (value: string): SequenceFrameData['frameType'] => {
  const frameType = value.toLowerCase().replaceAll('[', '').replaceAll(']', '');
  const isKnownFrameType = SEQUENCE_FRAME_TYPES.has(frameType);
  if (isKnownFrameType) return frameType as SequenceFrameData['frameType'];
  return 'loop';
};

const readSequenceSections = (group: Element, bounds: SequenceBounds) => {
  const sectionY = (section: Element) => getNumericAttribute(section, 'y', bounds.y) - bounds.y;
  return Array.from(group.querySelectorAll('.sectionTitle')).map((section) => ({
    label: section.textContent?.trim() || '',
    y: sectionY(section),
  }));
};

const readSequenceControlFrames = (svg: SVGSVGElement): SequenceFrameRecord[] => {
  const frames = Array.from(svg.querySelectorAll('g[data-et="control-structure"]')).map(
    (group, index) => {
      const bounds = readSequenceBounds(Array.from(group.querySelectorAll('.loopLine')));
      if (!bounds) return null;
      const sections = readSequenceSections(group, bounds);
      const frameType = getSequenceFrameType(getText(group, '.labelText'));
      const id = group.getAttribute('data-id') || `control-${index}`;
      return Object.assign({}, bounds, {
        frameType,
        id: `frame-${id}`,
        label: getText(group, '.loopText'),
        sections,
      });
    },
  );
  return frames.filter((frame): frame is SequenceFrameRecord => frame !== null);
};

const readSequenceRectFill = (rect: Element) => {
  const fill = rect.getAttribute('fill');
  if (fill === 'transparent') return undefined;
  return fill || undefined;
};

const readSequenceRectFrames = (svg: SVGSVGElement): SequenceFrameRecord[] => {
  return Array.from(svg.querySelectorAll('rect.rect')).map((rect, index) => ({
    fill: readSequenceRectFill(rect),
    frameType: 'rect',
    height: getNumericAttribute(rect, 'height', 0),
    id: `frame-rect-${index}`,
    label: '',
    sections: [],
    width: getNumericAttribute(rect, 'width', 0),
    x: getNumericAttribute(rect, 'x', 0),
    y: getNumericAttribute(rect, 'y', 0),
  }));
};

const readSequenceFrames = (svg: SVGSVGElement) => {
  return readSequenceRectFrames(svg)
    .concat(readSequenceControlFrames(svg))
    .sort((first, second) => first.y - second.y);
};

const readSequenceNotes = (svg: SVGSVGElement) => {
  return Array.from(svg.querySelectorAll('g[data-et="note"]')).flatMap((group, index) => {
    const rect = group.querySelector('rect.note');
    if (!rect) return [];
    const bounds: SequenceBounds = {
      height: getNumericAttribute(rect, 'height', 0),
      width: getNumericAttribute(rect, 'width', 0),
      x: getNumericAttribute(rect, 'x', 0),
      y: getNumericAttribute(rect, 'y', 0),
    };
    const id = group.getAttribute('data-id') || `note-${index}`;
    return [Object.assign({}, bounds, { id: `note-${id}`, label: getText(group, '.noteText') })];
  });
};

const readSequenceActivation = (rect: Element, participants: SequenceParticipantRecord[]) => {
  const x = getNumericAttribute(rect, 'x', 0);
  const y = getNumericAttribute(rect, 'y', 0);
  const width = getNumericAttribute(rect, 'width', 0);
  const height = getNumericAttribute(rect, 'height', 0);
  const participant = getNearestParticipant(participants, x + width / 2);
  if (!participant) return null;
  const activation = { height, width, x: x - participant.x, y };
  return [participant.id, activation] as const;
};

const readSequenceActivations = (svg: SVGSVGElement, participants: SequenceParticipantRecord[]) => {
  const entries = Array.from(svg.querySelectorAll('rect[class^="activation"]')).flatMap((rect) => {
    const entry = readSequenceActivation(rect, participants);
    return entry ? [entry] : [];
  });
  const groups = EffectArray.groupBy(entries, ([id]) => `participant:${id}`);
  const activations = Array.from(Object.values(groups), (items) => {
    const [[id]] = items;
    const values = items.map(([, activation]) => activation);
    return [id, values] as const;
  });
  return new Map(activations);
};

const getPathStart = (element: Element) => {
  const path = element.getAttribute('d') || '';
  const match = path.match(/M\s*([\d.-]+)[,\s]+([\d.-]+)/);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
};

const readSequenceMessagePoint = (element: Element): SequenceMessagePoint | null => {
  const lineStart = element.getAttribute('x1');
  const lineEnd = element.getAttribute('x2');
  const hasLinePoints = lineStart !== null && lineEnd !== null;
  if (hasLinePoints) {
    const sourceX = Number(lineStart);
    const targetX = Number(lineEnd);
    const y = getNumericAttribute(element, 'y1', 0);
    return { sourceX, targetX, y };
  }

  const pathStart = getPathStart(element);
  if (!pathStart) return null;
  return { sourceX: pathStart.x, targetX: pathStart.x, y: pathStart.y };
};

const getNearestParticipant = (participants: SequenceParticipantRecord[], x: number) => {
  return participants.reduce<SequenceParticipantRecord | null>((nearest, participant) => {
    const center = participant.x + participant.width / 2;
    let nearestDistance = Infinity;
    if (nearest) nearestDistance = Math.abs(nearest.x + nearest.width / 2 - x);
    const isCloser = Math.abs(center - x) < nearestDistance;
    if (isCloser) return participant;
    return nearest;
  }, null);
};

const createSequenceNode = ({
  participant,
  height,
  activations,
  handles,
  settings,
}: {
  participant: SequenceParticipantRecord;
  height: number;
  activations: SequenceActivation[];
  handles: SequenceParticipantHandle[];
  settings: TranslationSettings;
}): Node<SequenceParticipantData> => {
  const appearanceStyle = createSequenceStyle(settings);
  const frameStyle = {
    height,
    width: participant.width,
  };
  return {
    data: {
      activations,
      handles,
      kind: 'sequence-participant',
      label: participant.label,
      style: appearanceStyle,
      styleVersion: 1,
    },
    id: participant.id,
    position: { x: participant.x, y: 0 },
    sourcePosition: Position.Bottom,
    style: frameStyle,
    targetPosition: Position.Bottom,
    type: SEQUENCE_PARTICIPANT_NODE_TYPE,
  };
};

const getParticipantCenter = (participant: SequenceParticipantRecord) => {
  const halfWidth = participant.width / 2;
  return participant.x + halfWidth;
};

const getActionCenter = (message: SequenceMessageRecord) => {
  const sourceCenter = getParticipantCenter(message.source);
  const targetCenter = getParticipantCenter(message.target);
  if (sourceCenter === targetCenter) return sourceCenter + SEQUENCE_SELF_MESSAGE_OFFSET;
  const midpoint = sourceCenter + targetCenter;
  return midpoint / 2;
};

const getActionWidth = (label: string, sequenceNumber?: string) => {
  const content = [sequenceNumber, label].filter(Boolean).join(' ');
  const estimatedWidth = content.length * 8 + 16;
  return Math.max(SEQUENCE_ACTION_NODE_MIN_WIDTH, estimatedWidth);
};

const getParticipantHandleSide = (participant: SequenceParticipantRecord, actionCenter: number) => {
  const participantCenter = getParticipantCenter(participant);
  if (participantCenter < actionCenter) return 'right';
  return 'left';
};

const getActionHandleSide = (participant: SequenceParticipantRecord, actionCenter: number) => {
  const participantCenter = getParticipantCenter(participant);
  if (participantCenter < actionCenter) return 'left';
  return 'right';
};

const createMessageHandleEntries = (message: SequenceMessageRecord) => {
  const isSelfMessage = message.source.id === message.target.id;
  const sourceY = message.point.y;
  const targetY = isSelfMessage ? sourceY + SEQUENCE_SELF_MESSAGE_HEIGHT : sourceY;
  const handle: SequenceParticipantHandle = { id: message.id, sourceY, targetY };
  const source = [message.source.id, handle] as const;
  if (isSelfMessage) return [source];
  const target = [message.target.id, handle] as const;
  return [source, target];
};

const createParticipantHandles = (
  entries: ReadonlyArray<readonly [string, SequenceParticipantHandle]>,
) => {
  return entries.map(([, handle]) => handle);
};

const createParticipantHandleMap = (messages: SequenceMessageRecord[]) => {
  const entries = messages.flatMap(createMessageHandleEntries);
  const groups = EffectArray.groupBy(entries, ([id]) => `participant:${id}`);
  const handles = Object.values(groups).map((items) => {
    const [[id]] = items;
    const participantHandles = createParticipantHandles(items);
    return [id, participantHandles] as const;
  });
  return new Map(handles);
};

const createSequenceActionNode = (
  message: SequenceMessageRecord,
  settings: TranslationSettings,
): Node<SequenceActionData> => {
  const width = getActionWidth(message.label);
  const actionCenter = getActionCenter(message);
  const x = actionCenter - width / 2;
  const y = message.point.y - SEQUENCE_ACTION_NODE_HEIGHT / 2;
  const style = createSequenceStyle(settings);
  return {
    data: {
      kind: 'sequence-action',
      label: message.label,
      sequenceNumber: message.sequenceNumber,
      style,
      styleVersion: 1,
    },
    id: message.actionId,
    position: { x, y },
    style: { height: SEQUENCE_ACTION_NODE_HEIGHT, width },
    type: SEQUENCE_ACTION_NODE_TYPE,
  };
};

const createSequenceNoteNode = (
  note: SequenceBounds & { id: string; label: string },
  settings: TranslationSettings,
): Node<SequenceNoteData> => {
  const style = createSequenceStyle(settings);
  const { height, id, label, width, x, y } = note;
  return {
    data: { kind: 'sequence-note', label, style, styleVersion: 1 },
    id,
    position: { x, y },
    style: { height, width },
    type: SEQUENCE_NOTE_NODE_TYPE,
  };
};

const createSequenceFrameNode = (
  frame: SequenceFrameRecord,
  settings: TranslationSettings,
): Node<SequenceFrameData> => {
  const style = createSequenceStyle(settings);
  const data: SequenceFrameData = {
    fill: frame.fill,
    frameType: frame.frameType,
    kind: 'sequence-frame',
    label: frame.label,
    sections: frame.sections,
    style,
    styleVersion: 1,
  };
  return {
    data,
    id: frame.id,
    position: { x: frame.x, y: frame.y },
    style: { height: frame.height, width: frame.width },
    type: SEQUENCE_FRAME_NODE_TYPE,
    zIndex: -1,
  };
};

const createSequenceMessageRecord = ({
  element,
  label,
  index,
  participants,
  participantsById,
  point,
  sequenceNumber,
}: {
  element: Element;
  label: string;
  index: number;
  participants: SequenceParticipantRecord[];
  participantsById: Map<string, SequenceParticipantRecord>;
  point: SequenceMessagePoint;
  sequenceNumber?: string;
}): SequenceMessageRecord => {
  const sourceId = element.getAttribute('data-from');
  const targetId = element.getAttribute('data-to');
  const source =
    participantsById.get(sourceId || '') || getNearestParticipant(participants, point.sourceX);
  const target =
    participantsById.get(targetId || '') || getNearestParticipant(participants, point.targetX);
  if (!source) throw new Error('Mermaid sequence message has no source participant.');
  if (!target) throw new Error('Mermaid sequence message has no target participant.');
  const id = `message-${element.getAttribute('data-id') || index}`;
  return {
    actionId: `action-${id}`,
    dashed: element.classList.contains('messageLine1'),
    id,
    label,
    markerEnd: element.getAttribute('marker-end') !== null,
    markerStart: element.getAttribute('marker-start') !== null,
    point,
    sequenceNumber,
    source,
    target,
  };
};

const getParticipantHandleId = (messageId: string, type: 'source' | 'target', side: string) => {
  return `${messageId}-${type}-${side}`;
};

const getActionHandleId = (type: 'source' | 'target', side: string) => {
  return `${side}-${type}`;
};

const createSequenceMessageData = (
  message: SequenceMessageRecord,
  segment: SequenceMessageData['segment'],
): SequenceMessageData => {
  const isSourceSegment = segment === 'source';
  const hasMermaidMarker = message.markerStart || message.markerEnd;
  const hasEndMarker = !hasMermaidMarker || message.markerEnd;
  const markerEnd = !isSourceSegment && hasEndMarker;
  const markerStart = isSourceSegment && message.markerStart;
  return {
    dashed: message.dashed,
    kind: 'sequence-message',
    markerEnd,
    markerStart,
    messageY: message.point.y,
    segment,
    selfMessage: message.source.id === message.target.id,
    sequenceNumber: isSourceSegment ? message.sequenceNumber : undefined,
  };
};

const createSequenceMessageEdge = (
  message: SequenceMessageRecord,
  segment: SequenceMessageData['segment'],
  settings: TranslationSettings,
): Edge<SequenceMessageData> => {
  const isSourceSegment = segment === 'source';
  const participant = isSourceSegment ? message.source : message.target;
  const actionCenter = getActionCenter(message);
  const participantSide = getParticipantHandleSide(participant, actionCenter);
  const actionSide = getActionHandleSide(participant, actionCenter);
  const data = createSequenceMessageData(message, segment);
  const { markerEnd, markerStart } = data;
  return {
    data,
    id: `${message.id}-${segment}`,
    markerEnd: markerEnd ? createEdgeMarker(settings.edgeMarker, settings.edgeColor) : undefined,
    markerStart: markerStart
      ? createEdgeMarker(settings.edgeMarker, settings.edgeColor)
      : undefined,
    source: isSourceSegment ? message.source.id : message.actionId,
    sourceHandle: isSourceSegment
      ? getParticipantHandleId(message.id, 'source', participantSide)
      : getActionHandleId('source', actionSide),
    style: createEdgeStyle(settings),
    target: isSourceSegment ? message.actionId : message.target.id,
    targetHandle: isSourceSegment
      ? getActionHandleId('target', actionSide)
      : getParticipantHandleId(message.id, 'target', participantSide),
    type: SEQUENCE_MESSAGE_EDGE_TYPE,
  };
};

const readSequenceMessages = (svg: SVGSVGElement, participants: SequenceParticipantRecord[]) => {
  const participantEntries = participants.map(
    (participant) => [participant.id, participant] as const,
  );
  const participantsById = new Map(participantEntries);
  const messageElements = Array.from(svg.querySelectorAll('[data-et="message"]'));
  const labels = Array.from(svg.querySelectorAll('.messageText')).map(
    (message) => message.textContent?.trim() || '',
  );
  const sequenceNumbers = Array.from(svg.querySelectorAll('.sequenceNumber')).map(
    (number) => number.textContent?.trim() || '',
  );
  return messageElements.flatMap((element, index) => {
    const point = readSequenceMessagePoint(element);
    if (!point) return [];
    return [
      createSequenceMessageRecord({
        element,
        label: labels[index] || '',
        index,
        participants,
        participantsById,
        point,
        sequenceNumber: sequenceNumbers[index],
      }),
    ];
  });
};

export const parseSequenceSvg = (
  svg: SVGSVGElement,
  settings: TranslationSettings,
): GraphElements => {
  const participants = readSequenceParticipants(svg);
  const height = getSequenceHeight(svg);
  const messages = readSequenceMessages(svg, participants);
  const handleMap = createParticipantHandleMap(messages);
  const activationMap = readSequenceActivations(svg, participants);
  const frameNodes: Node[] = readSequenceFrames(svg).map((frame) =>
    createSequenceFrameNode(frame, settings),
  );
  const noteNodes: Node[] = readSequenceNotes(svg).map((note) =>
    createSequenceNoteNode(note, settings),
  );
  const participantNodes: Node[] = participants.map((participant) =>
    createSequenceNode({
      participant,
      height,
      activations: activationMap.get(participant.id) || [],
      handles: handleMap.get(participant.id) || [],
      settings,
    }),
  );
  const actionNodes = messages.map((message) => createSequenceActionNode(message, settings));
  const edges = messages.flatMap((message) => [
    createSequenceMessageEdge(message, 'source', settings),
    createSequenceMessageEdge(message, 'target', settings),
  ]);
  return { nodes: frameNodes.concat(noteNodes, participantNodes, actionNodes), edges };
};
