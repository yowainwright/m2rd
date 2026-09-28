import { Schema } from 'effect';
import type { CSSProperties } from 'react';
import { GraphRenderError } from '../types';
import { GanttTasksSchema } from './constants';
import type { GanttBounds, GanttGraphic, GanttPart, GanttTask } from './types';

export const ganttCompatibilityError = () =>
  new GraphRenderError(
    'unsupported',
    'This Gantt diagram is not supported. Use regular task rows with plain labels, without compact mode, vertical markers, or hand-drawn styling.',
    'gantt',
  );

export const readGanttTasks = (value: unknown) => {
  const decoded = Schema.decodeUnknownEither(GanttTasksSchema)(value);
  if (decoded._tag === 'Left') throw ganttCompatibilityError();
  const tasks = decoded.right;
  const ids = new Set(tasks.map((task) => task.id));
  const invalidDates = tasks.some((task) => task.endTime < task.startTime);
  const invalid = ids.size !== tasks.length || invalidDates;
  if (invalid) throw ganttCompatibilityError();
  return tasks;
};

export const ganttTaskKey = (task: GanttTask) => {
  const fields = task.raw.data.replace(/^:/, '').split(',');
  const explicit = fields.length >= 3 && fields.at(-3)?.trim() === task.id;
  if (explicit) return `id:${task.id}`;
  return JSON.stringify([task.section, task.task.trim()]);
};

export const requireGanttGraphic = (element: Element | null | undefined) => {
  if (!(element instanceof SVGGraphicsElement)) throw ganttCompatibilityError();
  return element;
};

export const combineGanttBounds = (bounds: GanttBounds[]): GanttBounds => {
  const x = Math.min(...bounds.map((box) => box.x));
  const y = Math.min(...bounds.map((box) => box.y));
  const right = Math.max(...bounds.map((box) => box.x + box.width));
  const bottom = Math.max(...bounds.map((box) => box.y + box.height));
  const width = Math.max(1, right - x);
  const height = Math.max(1, bottom - y);
  return { x, y, width, height };
};

const getGanttMatrix = (element: SVGGraphicsElement) => {
  const root = element.ownerSVGElement?.getCTM();
  const matrix = element.getCTM();
  const missingMatrix = !root || !matrix;
  if (missingMatrix) throw ganttCompatibilityError();
  return root.inverse().multiply(matrix);
};

const measureGanttGraphic = (element: SVGGraphicsElement) => {
  const box = element.getBBox();
  const matrix = getGanttMatrix(element);
  const corners = [
    new DOMPoint(box.x, box.y),
    new DOMPoint(box.x + box.width, box.y),
    new DOMPoint(box.x, box.y + box.height),
    new DOMPoint(box.x + box.width, box.y + box.height),
  ].map((point) => point.matrixTransform(matrix));
  const points = corners.map(({ x, y }) => ({ x, y, width: 0, height: 0 }));
  const bounds = combineGanttBounds(points);
  if (!Object.values(bounds).every(Number.isFinite)) throw ganttCompatibilityError();
  const origin = corners[0];
  const transform = `matrix(${matrix.a},${matrix.b},${matrix.c},${matrix.d},0,0)`;
  const style: CSSProperties = {
    position: 'absolute',
    left: origin.x,
    top: origin.y,
    width: box.width,
    height: box.height,
    transform,
    transformOrigin: '0 0',
  };
  return { bounds, style };
};

const readGanttOpacity = (element: Element): number => {
  const opacity = Number(getComputedStyle(element).opacity);
  const parent = element.parentElement;
  if (!(parent instanceof SVGElement)) return opacity;
  return opacity * readGanttOpacity(parent);
};

const readGanttShapeStyle = (element: SVGGraphicsElement): CSSProperties => {
  const computed = getComputedStyle(element);
  const stroke = computed.stroke;
  const dashed = computed.strokeDasharray
    .split(/[,\s]+/)
    .some((value) => Number.parseFloat(value) > 0);
  const visibleStyle = dashed ? 'dashed' : 'solid';
  const borderStyle = stroke === 'none' ? 'none' : visibleStyle;
  const backgroundColor = computed.fill === 'none' ? 'transparent' : computed.fill;
  const borderWidth = Number.parseFloat(computed.strokeWidth) || 0;
  const borderRadius = Number(element.getAttribute('rx')) || 0;
  const borderColor = stroke === 'none' ? 'transparent' : stroke;
  const opacity = readGanttOpacity(element);
  return {
    backgroundColor,
    borderColor,
    borderStyle,
    borderWidth,
    borderRadius,
    opacity,
    boxShadow: 'none',
  };
};

export const readGanttGraphic = (element: SVGGraphicsElement): GanttGraphic => {
  const { bounds, style: geometry } = measureGanttGraphic(element);
  const computed = getComputedStyle(element);
  const sourceStyle = readGanttShapeStyle(element);
  if (element.tagName === 'line') {
    const width = Math.max(Number.parseFloat(computed.strokeWidth), bounds.width);
    const height = Math.max(Number.parseFloat(computed.strokeWidth), bounds.height);
    const style = Object.assign({}, geometry, {
      width,
      height,
      backgroundColor: computed.stroke,
      opacity: sourceStyle.opacity,
    });
    return { bounds, part: { kind: 'line', style } };
  }
  if (element.tagName === 'rect') {
    const style = Object.assign({}, geometry, sourceStyle);
    return { bounds, part: { kind: 'rect', style } };
  }
  const text = element.textContent?.trim() || '';
  const style = Object.assign({}, geometry, {
    color: computed.fill,
    fontFamily: computed.fontFamily,
    fontSize: computed.fontSize,
    fontWeight: computed.fontWeight,
    fontStyle: computed.fontStyle,
    lineHeight: `${bounds.height}px`,
    whiteSpace: 'pre' as const,
    opacity: sourceStyle.opacity,
  });
  return { bounds, part: { kind: 'text', text, style } };
};

export const readGanttText = (element: SVGGraphicsElement) => {
  const spans = Array.from(element.querySelectorAll<SVGGraphicsElement>('tspan'));
  const labels = spans.length ? spans : [element];
  return labels.map(readGanttGraphic);
};

export const positionGanttParts = (graphics: GanttGraphic[], frame: GanttBounds): GanttPart[] => {
  return graphics.map(({ part }) => {
    const left = Number(part.style.left) - frame.x;
    const top = Number(part.style.top) - frame.y;
    const style = Object.assign({}, part.style, { left, top });
    return Object.assign({}, part, { style });
  });
};
