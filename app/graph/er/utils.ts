import { Either, Schema } from 'effect';
import type { CSSProperties } from 'react';
import { GraphRenderError } from '../types';
import { readClassText } from '../class/utils';
import { ErMetadataSchema, ErPointsSchema } from './constants';
import type {
  ErCell,
  ErDivider,
  ErFrame,
  ErGeometry,
  ErGraphics,
  ErMetadataEdge,
  ErMetadataNode,
} from './types';

export const erCompatibilityError = () =>
  new GraphRenderError(
    'unsupported',
    'This ER diagram is not supported. Use plain entity labels and attributes without groups or hand-drawn styling.',
    'er',
  );

const decodeErPoints = Schema.decodeUnknownEither(Schema.parseJson(ErPointsSchema));

export const readErMetadata = (value: unknown) => {
  const decoded = Schema.decodeUnknownEither(ErMetadataSchema)(value);
  if (decoded._tag === 'Left') throw erCompatibilityError();
  const metadata = decoded.right;
  const ids = new Set(metadata.nodes.map((node) => node.id));
  const names = new Set(metadata.nodes.map((node) => node.label));
  const edgeIds = new Set(metadata.edges.map((edge) => edge.id));
  const missingEndpoint = metadata.edges.some((edge) => !ids.has(edge.start) || !ids.has(edge.end));
  const duplicateNode = ids.size !== metadata.nodes.length || names.size !== ids.size;
  const duplicateEdge = edgeIds.size !== metadata.edges.length;
  const invalid = missingEndpoint || duplicateNode || duplicateEdge;
  if (invalid) throw erCompatibilityError();
  return metadata;
};

export const erRelationKey = (edge: ErMetadataEdge, ids: ReadonlyMap<string, string>) =>
  JSON.stringify([
    ids.get(edge.start),
    ids.get(edge.end),
    edge.label,
    edge.arrowTypeStart,
    edge.arrowTypeEnd,
    edge.pattern,
  ]);

const requireGraphic = (element: Element | null | undefined): SVGGraphicsElement => {
  if (!(element instanceof SVGGraphicsElement)) throw erCompatibilityError();
  return element;
};

const readBounds = (element: SVGGraphicsElement): ErFrame => {
  const box = element.getBBox();
  const root = element.ownerSVGElement?.getCTM();
  const matrix = element.getCTM();
  const missingMatrix = !root || !matrix;
  if (missingMatrix) throw erCompatibilityError();
  const transform = root.inverse().multiply(matrix);
  const origin = new DOMPoint(box.x, box.y).matrixTransform(transform);
  const end = new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(transform);
  const width = end.x - origin.x;
  const height = end.y - origin.y;
  const x = origin.x + width / 2;
  const y = origin.y + height / 2;
  const frame = { x, y, width, height };
  if (!Object.values(frame).every(Number.isFinite)) throw erCompatibilityError();
  return frame;
};

const relativeStyle = (bounds: ErFrame, frame: ErFrame): CSSProperties => {
  const left = bounds.x - bounds.width / 2 - frame.x + frame.width / 2;
  const top = bounds.y - bounds.height / 2 - frame.y + frame.height / 2;
  return { position: 'absolute', left, top, width: bounds.width, height: bounds.height };
};

const readCell = (element: SVGGraphicsElement, frame: ErFrame): ErCell => {
  const richContent = element.querySelector('strong, em, code, a, img, svg');
  if (richContent) throw erCompatibilityError();
  const bounds = readBounds(element);
  const text = readClassText(element);
  const computed = getComputedStyle(element.querySelector('span, text') || element);
  const style = Object.assign(relativeStyle(bounds, frame), {
    fontSize: computed.fontSize,
    fontWeight: computed.fontWeight,
    fontStyle: computed.fontStyle,
    lineHeight: computed.lineHeight,
    whiteSpace: 'pre-wrap' as const,
  });
  return { text, style };
};

const readCells = (element: SVGGraphicsElement, node: ErMetadataNode, frame: ErFrame) => {
  const empty = node.attributes.length === 0;
  const selector = empty ? 'g.label' : ':scope > .label';
  const labels = Array.from(element.querySelectorAll<SVGGraphicsElement>(selector));
  const expected = empty ? 1 : 1 + node.attributes.length * 4;
  if (labels.length !== expected) throw erCompatibilityError();
  return labels.map((label) => readCell(label, frame));
};

const readShapeStyle = (surface: SVGGraphicsElement): CSSProperties => {
  const shapes = Array.from(surface.querySelectorAll('path'), (path) => getComputedStyle(path));
  const fill = shapes[0] || getComputedStyle(surface);
  const outline = shapes.find((style) => style.stroke !== 'none') || fill;
  const hasDash = outline.strokeDasharray
    .split(/[,\s]+/)
    .some((value) => Number.parseFloat(value) > 0);
  const visibleStyle = hasDash ? 'dashed' : 'solid';
  const borderStyle = outline.stroke === 'none' ? 'none' : visibleStyle;
  const borderColor = outline.stroke === 'none' ? 'transparent' : outline.stroke;
  return {
    backgroundColor: fill.fill,
    borderColor,
    borderStyle,
    borderWidth: Number.parseFloat(outline.strokeWidth) || 0,
  };
};

const readDivider = (element: SVGGraphicsElement, frame: ErFrame): ErDivider => {
  const bounds = readBounds(element);
  const vertical = bounds.height > bounds.width;
  const orientation = vertical ? 'vertical' : 'horizontal';
  const width = vertical ? 1 : bounds.width;
  const height = vertical ? bounds.height : 1;
  const style = Object.assign(relativeStyle(bounds, frame), { width, height });
  return { orientation, style };
};

export const readErGeometry = (
  graphics: ErGraphics,
  id: string,
  node: ErMetadataNode,
): ErGeometry => {
  const element = requireGraphic(graphics.get(`${id}-${node.id}`));
  const surface = requireGraphic(element.querySelector('.outer-path, .label-container'));
  const frame = readBounds(surface);
  const emptyFrame = frame.width <= 0 || frame.height <= 0;
  if (emptyFrame) throw erCompatibilityError();
  const cells = readCells(element, node, frame);
  const dividers = Array.from(element.querySelectorAll<SVGGraphicsElement>('.divider'), (line) =>
    readDivider(line, frame),
  );
  const rows = Array.from(
    element.querySelectorAll<SVGGraphicsElement>('.row-rect-odd, .row-rect-even'),
    (row) => Object.assign(relativeStyle(readBounds(row), frame), readShapeStyle(row)),
  );
  const color = getComputedStyle(element.querySelector('span, text') || element).color;
  const sourceStyle = Object.assign(readShapeStyle(surface), {
    color,
    fontFamily: getComputedStyle(element).fontFamily,
  });
  const data = {
    kind: 'er-node' as const,
    label: cells[0].text,
    attributes: node.attributes,
    cells,
    rows,
    dividers,
    sourceStyle,
  };
  return { frame, data };
};

export const readErPoints = (graphics: ErGraphics, id: string) => {
  const path = requireGraphic(graphics.get(id));
  const encoded = path.getAttribute('data-points');
  if (!encoded) throw erCompatibilityError();
  return Either.try(() => atob(encoded)).pipe(
    Either.flatMap(decodeErPoints),
    Either.getOrThrowWith(erCompatibilityError),
  );
};
