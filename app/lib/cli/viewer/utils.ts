import { closeSync, openSync } from 'node:fs';
import { ReadStream } from 'node:tty';
import { assign, assertEvent, fromPromise, setup } from 'xstate';
import { Effect } from 'effect';
import stringWidth from 'string-width';
import type { Key } from 'ink';
import { errorMessage, exportSvg } from '../utils';
import type { TerminalInput, ViewerContext, ViewerEvent, ViewerProps, ViewerSize } from './types';

export const viewerSize = (terminal: ViewerSize, viewport: ViewerSize = terminal) => {
  const columns = Math.min(terminal.columns, viewport.columns);
  const rows = Math.min(terminal.rows, viewport.rows);
  return { columns, rows };
};

export const viewerStatusText = (context: ViewerContext) => {
  const column = context.left + 1;
  const row = context.top + 1;
  const position = `${column},${row} | ${context.contentWidth}x${context.contentHeight}`;
  const save = context.svgExport ? ' | s save SVG' : '';
  const details = context.message ?? position;
  const multiple = (context.navigation?.items.length ?? 0) > 1;
  const navigation = multiple ? 'p previous | n next | ' : '';
  return `${navigation}arrows / hjkl scroll${save} | q quit | ${details}`;
};

export const viewerTitle = ({ navigation }: ViewerContext) => {
  if (!navigation) return undefined;
  const label = navigation.items[navigation.index].label;
  return `${label} · diagram ${navigation.index + 1}/${navigation.items.length}`;
};

export const currentDiagram = ({ navigation }: ViewerContext, fallback: string) => {
  if (!navigation) return fallback;
  return navigation.items[navigation.index].diagram;
};

export const measureDiagram = (diagram: string) => {
  const lines = diagram.split('\n');
  const contentWidth = Math.max(1, ...lines.map((line) => stringWidth(line)));
  return { contentWidth, contentHeight: lines.length };
};

const clampPosition = (context: ViewerContext, x: number, y: number) => {
  const maxLeft = Math.max(0, context.contentWidth - context.width);
  const maxTop = Math.max(0, context.contentHeight - context.height);
  const left = Math.max(0, Math.min(x, maxLeft));
  const top = Math.max(0, Math.min(y, maxTop));
  return { left, top };
};

export const viewportSize = (columns: number, rows: number, header = false) => {
  const reservedRows = header ? 3 : 2;
  const width = Math.max(1, columns - 1);
  const height = Math.max(1, rows - reservedRows);
  return { width, height };
};

export const viewerInput = (props: ViewerProps, dimensions: ViewerSize): ViewerContext => {
  const { diagram, svgExport } = props;
  const multiple = Array.isArray(diagram);
  const drawing = multiple ? (diagram[0]?.diagram ?? '') : diagram;
  const navigation = multiple ? { items: diagram, index: 0 } : undefined;
  const size = measureDiagram(drawing);
  const viewport = viewportSize(dimensions.columns, dimensions.rows, multiple);
  return Object.assign({}, size, viewport, { left: 0, top: 0, svgExport, navigation });
};

const selectDiagram = (context: ViewerContext, offset: number) => {
  const navigation = context.navigation;
  if (!navigation) return {};
  const index = navigation.index + offset;
  const size = measureDiagram(navigation.items[index].diagram);
  const selection = Object.assign({}, navigation, { index });
  return Object.assign({}, size, { navigation: selection, left: 0, top: 0, message: undefined });
};

export const viewerSetup = setup({
  types: {
    context: {} as ViewerContext,
    input: {} as ViewerContext,
    events: {} as ViewerEvent,
  },
  actors: {
    saveSvg: fromPromise(({ input, signal }: { input: ViewerContext; signal: AbortSignal }) => {
      if (!input.svgExport) throw new Error('SVG export is unavailable.');
      const { source, path } = input.svgExport;
      return Effect.runPromise(exportSvg(source, path), { signal });
    }),
  },
  guards: {
    canSave: ({ context }) => Boolean(context.svgExport),
    canPrevious: ({ context }) => (context.navigation?.index ?? 0) > 0,
    canNext: ({ context }) => {
      const navigation = context.navigation;
      if (!navigation) return false;
      const lastIndex = navigation.items.length - 1;
      return navigation.index < lastIndex;
    },
  },
  actions: {
    previous: assign(({ context }) => selectDiagram(context, -1)),
    next: assign(({ context }) => selectDiagram(context, 1)),
    saving: assign({ message: 'Saving SVG...' }),
    waitForSave: assign({ message: 'Saving SVG; wait to quit.' }),
    saved: assign(({ context }) => ({ message: `Saved ${context.svgExport?.path}` })),
    saveFailed: assign((_, cause: unknown) => {
      const message = `Save failed: ${errorMessage(cause)}`;
      return { message };
    }),
    scroll: assign(({ context, event }) => {
      assertEvent(event, 'scroll');
      const left = context.left + event.x;
      const top = context.top + event.y;
      return clampPosition(context, left, top);
    }),
    resize: assign(({ context, event }) => {
      assertEvent(event, 'resize');
      const { width, height } = event;
      const resized = Object.assign({}, context, { width, height });
      return Object.assign(resized, clampPosition(resized, context.left, context.top));
    }),
    home: assign({ left: 0, top: 0 }),
    end: assign(({ context }) => clampPosition(context, context.left, context.contentHeight)),
  },
});

export const keyboardEvent = (input: string, key: Key, page: number): ViewerEvent | undefined => {
  const quit = input === 'q' || (key.ctrl && input === 'c');
  if (quit) return { type: 'quit' };
  const modified = key.ctrl || key.meta || key.shift;
  if (modified) return undefined;
  if (input === 's') return { type: 'save' };
  if (input === 'p') return { type: 'previous' };
  if (input === 'n') return { type: 'next' };
  if (key.home) return { type: 'home' };
  if (key.end) return { type: 'end' };
  if (key.pageUp) return { type: 'scroll', x: 0, y: -page };
  if (key.pageDown) return { type: 'scroll', x: 0, y: page };
  const left = key.leftArrow || input === 'h';
  const right = key.rightArrow || input === 'l';
  const up = key.upArrow || input === 'k';
  const down = key.downArrow || input === 'j';
  const x = Number(right) - Number(left);
  const y = Number(down) - Number(up);
  const moved = x !== 0 || y !== 0;
  if (moved) return { type: 'scroll', x, y };
  return undefined;
};

const openKeyboard = () => {
  const fd = openSync('/dev/tty', 'r');
  try {
    return new ReadStream(fd);
  } finally {
    closeSync(fd);
  }
};

const openTerminal = (): TerminalInput => {
  if (!process.stdout.isTTY) throw new Error('An interactive terminal is required.');
  const owned = !process.stdin.isTTY;
  const stream = owned ? openKeyboard() : process.stdin;
  try {
    const { isRaw: raw } = stream;
    stream.setRawMode(true);
    stream.setRawMode(raw);
    return { stream, owned };
  } catch (cause) {
    if (owned) stream.destroy();
    throw cause;
  }
};

export const terminalInput = Effect.acquireRelease(
  Effect.try({
    try: openTerminal,
    catch: () =>
      'An interactive terminal is required. Run m2rd from a terminal with keyboard access.',
  }),
  ({ stream, owned }) =>
    Effect.sync(() => {
      if (owned) stream.destroy();
    }),
);
