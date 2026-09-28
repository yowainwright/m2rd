import { cleanText } from '../../utils';
import { SUPPORTED_FRAMES, UNSUPPORTED_ELEMENTS } from './constants';
import type {
  SequenceFrame,
  SequenceGraph,
  SequenceMessage,
  SequenceParticipant,
  SequenceRow,
} from './types';

const numeric = (element: Element, attribute: string) => {
  const value = element.getAttribute(attribute);
  const number = value === null ? NaN : Number(value);
  if (!Number.isFinite(number)) throw new Error(`Missing sequence geometry: ${attribute}.`);
  return number;
};

const text = (element: Element | null) => cleanText(element?.textContent ?? '');

const joinedText = (element: Element, selector: string) =>
  Array.from(element.querySelectorAll(selector)).map(text).join(' ');

const readParticipants = (svg: Document): SequenceParticipant[] => {
  const lines = Array.from(svg.querySelectorAll('[data-et="life-line"]'));
  const positions = new Map(
    lines.map((line) => [line.getAttribute('data-id'), numeric(line, 'x1')]),
  );
  return Array.from(svg.querySelectorAll('[data-et="participant"]'))
    .map((element) => {
      const id = element.getAttribute('data-id') ?? '';
      const x = positions.get(id);
      if (x === undefined) throw new Error(`Missing lifeline for ${id}.`);
      const label = joinedText(element, 'text') || id;
      return { id, label, x };
    })
    .toSorted((first, second) => first.x - second.x);
};

const messageY = (element: Element) => {
  if (element.hasAttribute('y1')) return numeric(element, 'y1');
  const path = element.getAttribute('d') ?? '';
  const start = path.match(/M\s*([\d.-]+)[,\s]+([\d.-]+)/);
  if (!start) throw new Error('Missing sequence message position.');
  return Number(start[2]);
};

const readMarker = (element: Element, name: string) => {
  const marker = element.getAttribute(name);
  if (!marker) return false;
  if (!marker.endsWith('-arrowhead)'))
    throw new Error(`Sequence marker ${marker} is not supported in this preview yet.`);
  return true;
};

const readMessages = (svg: Document): SequenceMessage[] => {
  const labels = Array.from(svg.querySelectorAll('.messageText')).map(text);
  const numbers = Array.from(svg.querySelectorAll('.sequenceNumber')).map(text);
  const messages = Array.from(svg.querySelectorAll('[data-et="message"]'));
  const partialNumbers = numbers.length > 0 && numbers.length !== messages.length;
  if (partialNumbers)
    throw new Error('Mixed autonumber modes are not supported in this sequence preview yet.');
  if (labels.length !== messages.length)
    throw new Error('Mermaid sequence labels do not match its messages.');
  return messages.map((element, index) => {
    const id = `message-${index}`;
    const from = element.getAttribute('data-from') ?? '';
    const to = element.getAttribute('data-to') ?? '';
    const number = numbers[index];
    const label = number ? `${number}. ${labels[index]}` : labels[index];
    const y = messageY(element);
    const dashed = element.classList.contains('messageLine1');
    const arrowStart = readMarker(element, 'marker-start');
    const arrowEnd = readMarker(element, 'marker-end');
    return { id, from, to, label, y, dashed, arrowStart, arrowEnd };
  });
};

const sectionName = (kind: string) => {
  if (kind === 'alt') return 'else';
  if (kind === 'critical') return 'option';
  return 'and';
};

const sectionCaption = (elements: Element[], y: number, end: number) => {
  const lines = elements.filter((element) => {
    const top = numeric(element, 'y');
    const withinSection = top > y && top < end;
    return withinSection;
  });
  return lines.map(text).join(' ');
};

const readSections = (group: Element, kind: string) => {
  const lines = Array.from(group.querySelectorAll('.loopLine[style*="stroke-dasharray"]'));
  const boundaries = lines
    .map((line) => numeric(line, 'y1'))
    .toSorted((first, second) => first - second);
  const titles = Array.from(group.querySelectorAll('.sectionTitle'));
  return boundaries.map((y, index) => {
    const end = boundaries[index + 1] ?? Infinity;
    const caption = sectionCaption(titles, y, end);
    const label = `${sectionName(kind)} ${caption}`;
    return { label, y };
  });
};

const readControlFrame = (group: Element, index: number): SequenceFrame => {
  const lines = Array.from(group.querySelectorAll('.loopLine'));
  const x = lines.flatMap((line) => [numeric(line, 'x1'), numeric(line, 'x2')]);
  const y = lines.flatMap((line) => [numeric(line, 'y1'), numeric(line, 'y2')]);
  const kind = text(group.querySelector('.labelText'));
  if (!SUPPORTED_FRAMES.includes(kind)) throw new Error(`Unsupported sequence frame: ${kind}.`);
  const label = `${kind} ${joinedText(group, '.loopText')}`.trim();
  const sections = readSections(group, kind);
  const id = `frame-${index}`;
  const [left, right, top, bottom] = [
    Math.min(...x),
    Math.max(...x),
    Math.min(...y),
    Math.max(...y),
  ];
  return { id, label, top, bottom, left, right, sections };
};

const readRectFrame = (element: Element, index: number): SequenceFrame => {
  const id = `rect-${index}`;
  const top = numeric(element, 'y');
  const bottom = top + numeric(element, 'height');
  const left = numeric(element, 'x');
  const right = left + numeric(element, 'width');
  return { id, label: 'rect', top, bottom, left, right, sections: [] };
};

export const readSequence = (svg: Document): SequenceGraph => {
  const unsupported = svg.querySelector(UNSUPPORTED_ELEMENTS.join(','));
  if (unsupported)
    throw new Error('Sequence notes and activations are not supported in this preview yet.');
  const participants = readParticipants(svg);
  if (!participants.length) throw new Error('The sequence has no participants.');
  const messages = readMessages(svg);
  const controls = Array.from(svg.querySelectorAll('[data-et="control-structure"]')).map(
    readControlFrame,
  );
  const rects = Array.from(svg.querySelectorAll('rect.rect')).map(readRectFrame);
  const frames = controls.concat(rects).toSorted((first, second) => first.top - second.top);
  return { participants, messages, frames };
};

const frameRows = (frame: SequenceFrame): SequenceRow[] => {
  const start = { id: `${frame.id}:start`, y: frame.top, label: frame.label };
  const end = { id: `${frame.id}:end`, y: frame.bottom, label: '' };
  const sections = frame.sections.map((section, index) => {
    const id = `${frame.id}:section-${index}`;
    return Object.assign({}, section, { id });
  });
  return [start].concat(sections, [end]);
};

export const sequenceRows = (graph: SequenceGraph): SequenceRow[] => {
  const messages = graph.messages.map((message) => {
    const { id, y, label } = message;
    return { id, y, label, message };
  });
  return graph.frames
    .flatMap(frameRows)
    .concat(messages)
    .toSorted((first, second) => first.y - second.y);
};
