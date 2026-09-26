import { closeSync, openSync } from 'node:fs';
import { ReadStream } from 'node:tty';
import { assign, assertEvent, setup } from 'xstate';
import { Effect } from 'effect';
import stringWidth from 'string-width';
import type { Key } from 'ink';
import type { TerminalInput, ViewerContext, ViewerEvent } from './types';

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

export const viewportSize = (columns: number, rows: number) => {
  const width = Math.max(1, columns - 1);
  const height = Math.max(1, rows - 2);
  return { width, height };
};

export const viewerSetup = setup({
  types: {
    context: {} as ViewerContext,
    input: {} as ViewerContext,
    events: {} as ViewerEvent,
  },
  actions: {
    scroll: assign(({ context, event }) => {
      assertEvent(event, 'scroll');
      const left = context.left + event.x;
      const top = context.top + event.y;
      return clampPosition(context, left, top);
    }),
    resize: assign(({ context, event }) => {
      assertEvent(event, 'resize');
      const width = event.width;
      const height = event.height;
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
    // On Unix, libuv opens its own descriptor for the TTY stream.
    // https://docs.libuv.org/en/v1.x/tty.html#c.uv_tty_init
    closeSync(fd);
  }
};

const openTerminal = (): TerminalInput => {
  if (!process.stdout.isTTY) throw new Error('An interactive terminal is required.');
  const owned = !process.stdin.isTTY;
  const stream = owned ? openKeyboard() : process.stdin;
  try {
    const raw = stream.isRaw;
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
