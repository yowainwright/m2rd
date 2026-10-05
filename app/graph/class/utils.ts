import { Result, Schema } from 'effect';
import type { CSSProperties } from 'react';
import { GraphRenderError } from '../types';
import { CLASS_COMPATIBILITY_ERROR, ClassMetadataSchema, ClassPointsSchema } from './constants';
import type {
  ClassFrame,
  ClassGeometry,
  ClassGraphics,
  ClassMetadataEdge,
  ClassMetadataNode,
  ClassRow,
} from './types';

export const classCompatibilityError = () =>
  new GraphRenderError('unsupported', CLASS_COMPATIBILITY_ERROR, 'classDiagram');

const decodeClassPoints = Schema.decodeUnknownResult(Schema.fromJsonString(ClassPointsSchema));

export const readClassMetadata = (value: unknown) => {
  const result = Schema.decodeUnknownResult(ClassMetadataSchema)(value);
  if (result._tag === 'Failure') throw classCompatibilityError();
  const data = result.success;
  const nodes = new Map(data.nodes.map((node) => [node.id, node]));
  const missingParent = data.nodes.some(
    (node) => node.parentId && !nodes.get(node.parentId)?.isGroup,
  );
  const missingEndpoint = data.edges.some((edge) => !nodes.has(edge.start) || !nodes.has(edge.end));
  const duplicateNode = nodes.size !== data.nodes.length;
  const duplicateEdge = new Set(data.edges.map((edge) => edge.id)).size !== data.edges.length;
  const invalid = missingParent || missingEndpoint || duplicateNode || duplicateEdge;
  if (invalid) throw classCompatibilityError();
  return data;
};

const requireGraphic = (graphics: ClassGraphics, id: string): SVGGraphicsElement => {
  const element = graphics.get(id);
  if (!(element instanceof SVGGraphicsElement)) throw classCompatibilityError();
  return element;
};

const getBounds = (element: SVGGraphicsElement): ClassFrame => {
  const box = element.getBBox();
  const svgMatrix = element.ownerSVGElement?.getCTM();
  const matrix = element.getCTM();
  const missingMatrix = !svgMatrix || !matrix;
  if (missingMatrix) throw classCompatibilityError();
  const transform = svgMatrix.inverse().multiply(matrix);
  const origin = new DOMPoint(box.x, box.y).matrixTransform(transform);
  const end = new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(transform);
  const width = end.x - origin.x;
  const height = end.y - origin.y;
  const x = origin.x + width / 2;
  const y = origin.y + height / 2;
  return { x, y, width, height };
};

export const readClassText = (element: Element): string => {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  clone.querySelectorAll('p').forEach((p) => p.append('\n'));
  return clone.textContent?.trim() || '';
};

export const decodeClassLabel = (text = '') => {
  const element = document.createElement('div');
  element.innerHTML = text;
  return readClassText(element);
};

export const classRelationKey = (edge: ClassMetadataEdge) =>
  JSON.stringify([
    edge.start,
    edge.end,
    decodeClassLabel(edge.label),
    edge.arrowTypeStart,
    edge.arrowTypeEnd,
    decodeClassLabel(edge.startLabelRight),
    decodeClassLabel(edge.endLabelLeft),
    edge.pattern,
  ]);

const readRow = (element: SVGGraphicsElement, frame: ClassFrame): ClassRow => {
  const bounds = getBounds(element);
  const text = readClassText(element);
  const styleElement = element.querySelector('span, text') || element;
  const computed = getComputedStyle(styleElement);
  const textDecoration = element.style.textDecoration || computed.textDecoration;
  const left = bounds.x - bounds.width / 2 - frame.x + frame.width / 2;
  const top = bounds.y - bounds.height / 2 - frame.y + frame.height / 2;
  const style: CSSProperties = {
    position: 'absolute',
    left,
    top,
    width: bounds.width,
    height: bounds.height,
    fontSize: computed.fontSize,
    fontWeight: computed.fontWeight,
    fontStyle: computed.fontStyle,
    textDecoration,
    lineHeight: computed.lineHeight,
    whiteSpace: 'pre-wrap',
  };
  return { text, style };
};

const readClassRows = (element: SVGGraphicsElement, node: ClassMetadataNode, frame: ClassFrame) => {
  if (node.shape !== 'classBox') {
    const label = element.querySelector<SVGGraphicsElement>('.cluster-label, g.label');
    if (!label) throw classCompatibilityError();
    return [readRow(label, frame)];
  }
  const sections = ['annotation', 'label', 'members', 'methods'];
  const expected = [
    Math.min(node.annotations?.length || 0, 1),
    1,
    node.members?.length,
    node.methods?.length,
  ];
  const labels = sections.flatMap((section, index) => {
    const labels = Array.from(
      element.querySelectorAll<SVGGraphicsElement>(`.${section}-group > .label`),
    );
    if (labels.length !== expected[index]) throw classCompatibilityError();
    return labels;
  });
  return labels.map((label) => readRow(label, frame));
};

const readSourceBorder = (container: SVGElement): CSSProperties => {
  const styles = Array.from(container.querySelectorAll('path'), (path) => getComputedStyle(path));
  const outline = styles.find((style) => {
    const hasStroke = style.stroke && style.stroke !== 'none';
    return hasStroke;
  });
  const computed = outline || styles[0] || getComputedStyle(container);
  const { stroke, strokeDasharray: dash } = computed;
  const borderColor = stroke === 'none' ? 'transparent' : stroke;
  const hasDash = dash.split(/[,\s]+/).some((value) => Number.parseFloat(value) > 0);
  const visibleBorderStyle = hasDash ? 'dashed' : 'solid';
  const borderStyle = stroke === 'none' ? 'none' : visibleBorderStyle;
  const width = Number.parseFloat(computed.strokeWidth);
  const borderWidth = Number.isFinite(width) ? width : 1;
  return { borderColor, borderStyle, borderWidth };
};

const readSourceStyle = (element: SVGGraphicsElement): CSSProperties => {
  const container = element.querySelector<SVGElement>('.label-container, :scope > rect');
  if (!container) throw classCompatibilityError();
  const shape = container.querySelector<SVGElement>('path') || container;
  const computed = getComputedStyle(shape);
  const backgroundColor = shape.style.fill || shape.getAttribute('fill') || computed.fill;
  const color = shape.style.color || computed.color || '#111827';
  const fontFamily = getComputedStyle(element).fontFamily;
  const border = readSourceBorder(container);
  return Object.assign({ backgroundColor, color, fontFamily }, border);
};

export const readClassGeometry = (
  graphics: ClassGraphics,
  id: string,
  node: ClassMetadataNode,
): ClassGeometry => {
  const element = requireGraphic(graphics, `${id}-${node.domId || node.id}`);
  const surface = element.querySelector<SVGGraphicsElement>('.label-container, :scope > rect');
  if (!surface) throw classCompatibilityError();
  const frame = getBounds(surface);
  const validFrame =
    Object.values(frame).every(Number.isFinite) && frame.width > 0 && frame.height > 0;
  if (!validFrame) throw classCompatibilityError();
  const shape = node.isGroup ? 'namespace' : node.shape;
  const kind = shape === 'rect' ? 'interface' : shape;
  const rows = readClassRows(element, node, frame);
  const dividers = Array.from(
    element.querySelectorAll<SVGGraphicsElement>('.divider'),
    (line) => getBounds(line).y - frame.y + frame.height / 2,
  );
  const sourceStyle = readSourceStyle(element);
  const label = decodeClassLabel(node.label);
  return { frame, data: { kind: 'class-node', shape: kind, label, rows, dividers, sourceStyle } };
};

export const readClassPoints = (graphics: ClassGraphics, id: string) => {
  const path = requireGraphic(graphics, id);
  const encoded = path.getAttribute('data-points');
  if (!encoded) throw classCompatibilityError();
  return Result.try(() => atob(encoded)).pipe(
    Result.flatMap(decodeClassPoints),
    Result.getOrThrowWith(classCompatibilityError),
  );
};
