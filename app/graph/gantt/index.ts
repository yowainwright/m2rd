import type { GanttTaskOptions } from './types';
import { Array as EffectArray } from 'effect';
import mermaid from 'mermaid';
import type { Node } from 'reactflow';
import { createLayoutHost } from '../state';
import { createSequenceStyle } from '../utils';
import type { GraphElements, TranslationSettings } from '../types';
import {
  GANTT_DECORATIONS,
  GANTT_FRAME_TYPE,
  GANTT_LAYOUT_WIDTH,
  GANTT_STATUSES,
  GANTT_TASK_TYPE,
} from './constants';
import type { GanttBounds, GanttGraphic, GanttNodeData, GanttTask } from './types';
import {
  combineGanttBounds,
  ganttCompatibilityError,
  ganttTaskKey,
  positionGanttParts,
  readGanttGraphic,
  readGanttTasks,
  readGanttText,
  requireGanttGraphic,
} from './utils';

const createGanttNode = (
  id: string,
  graphics: GanttGraphic[],
  data: GanttNodeData,
  frame: GanttBounds = combineGanttBounds(graphics.map(({ bounds }) => bounds)),
): Node<GanttNodeData> => {
  const parts = positionGanttParts(graphics, frame);
  const position = { x: frame.x, y: frame.y };
  const style = { width: frame.width, height: frame.height };
  const selectable = data.kind === 'gantt-task';
  const type = selectable ? GANTT_TASK_TYPE : GANTT_FRAME_TYPE;
  const zIndex = selectable ? 1 : -1;
  const content = Object.assign({}, data, { parts });
  return {
    id,
    data: content,
    position,
    style,
    type,
    zIndex,
    selectable,
    draggable: false,
    connectable: false,
    deletable: false,
    focusable: selectable,
  };
};

const createGanttTask = ({
  svg,
  renderId,
  task,
  id,
  ambiguousIdentity,
  settings,
}: GanttTaskOptions) => {
  const shape = requireGanttGraphic(svg.getElementById(`${renderId}-${task.id}`));
  const text = requireGanttGraphic(svg.getElementById(`${renderId}-${task.id}-text`));
  const incompatible = shape.tagName !== 'rect' || text.tagName !== 'text';
  if (incompatible) throw ganttCompatibilityError();
  const graphic = readGanttGraphic(shape);
  const labels = readGanttText(text);
  const graphics = [graphic].concat(labels);
  const { backgroundColor, borderColor, borderStyle, borderWidth } = graphic.part.style;
  const sourceStyle = {
    backgroundColor,
    borderColor,
    borderStyle,
    borderWidth,
    color: labels[0].part.style.color,
  };
  const status = GANTT_STATUSES.filter((key) => task[key]).join(', ');
  const data: GanttNodeData = {
    kind: 'gantt-task',
    label: task.task.trim(),
    section: task.section,
    status,
    start: task.startTime.toISOString(),
    end: task.endTime.toISOString(),
    ambiguousIdentity,
    sourceStyle,
    style: createSequenceStyle(settings),
    parts: [],
  };
  return createGanttNode(id, graphics, data);
};

const createGanttFrame = (svg: SVGSVGElement) => {
  const elements = Array.from(svg.querySelectorAll<SVGGraphicsElement>(GANTT_DECORATIONS));
  const graphics = elements.flatMap((element) => {
    if (element.tagName === 'text') return readGanttText(element);
    return [readGanttGraphic(element)];
  });
  if (!graphics.length) throw ganttCompatibilityError();
  const data: GanttNodeData = {
    kind: 'gantt-frame',
    label: 'Schedule',
    status: '',
    parts: [],
    sourceStyle: {},
    style: {},
  };
  const { x, y, width, height } = svg.viewBox.baseVal;
  const frame = { x, y, width, height };
  const validFrame = Object.values(frame).every(Number.isFinite) && width > 0 && height > 0;
  if (!validFrame) throw ganttCompatibilityError();
  return createGanttNode('gantt:frame', graphics, data, frame);
};

export const createGanttElements = (
  svg: SVGSVGElement,
  renderId: string,
  tasks: readonly GanttTask[],
  settings: TranslationSettings,
): GraphElements => {
  if (svg.querySelector('foreignObject, image')) throw ganttCompatibilityError();
  const groups = EffectArray.groupBy(tasks, ganttTaskKey);
  const createGroup = ([key, entries]: [string, readonly GanttTask[]]) => {
    const ambiguous = entries.length > 1;
    return entries.map((task, ordinal) => {
      const id = `gantt:${encodeURIComponent(JSON.stringify([key, ordinal]))}`;
      return createGanttTask({ svg, renderId, task, id, ambiguousIdentity: ambiguous, settings });
    });
  };
  const nodes = Object.entries(groups).flatMap(createGroup);
  return { nodes: [createGanttFrame(svg)].concat(nodes), edges: [] };
};

export const renderGanttDiagram = async (
  id: string,
  source: string,
  settings: TranslationSettings,
) => {
  const host = createLayoutHost(id, settings.fontFamily);
  host.style.width = `${GANTT_LAYOUT_WIDTH}px`;
  try {
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(source);
    const db = diagram.db;
    const getTasks = 'getTasks' in db ? db.getTasks : undefined;
    const getDisplayMode = 'getDisplayMode' in db ? db.getDisplayMode : undefined;
    const missingGetter = typeof getTasks !== 'function' || typeof getDisplayMode !== 'function';
    if (missingGetter) throw ganttCompatibilityError();
    const config = mermaid.mermaidAPI.getConfig();
    const compact =
      getDisplayMode.call(db) === 'compact' || config.gantt?.displayMode === 'compact';
    const unsupported = compact || config.look === 'handDrawn';
    if (unsupported) throw ganttCompatibilityError();
    const tasks = readGanttTasks(getTasks.call(db));
    host.replaceChildren();
    host.innerHTML = (await mermaid.render(id, source, host)).svg;
    const svg = host.querySelector('svg');
    if (!svg) throw ganttCompatibilityError();
    return createGanttElements(svg, id, tasks, settings);
  } finally {
    host.remove();
  }
};
