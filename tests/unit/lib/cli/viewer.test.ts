// @vitest-environment node
import { createActor, fromPromise, waitFor } from 'xstate';
import { expect, test, vi } from 'vitest';
import type { Key } from 'ink';
import { VIEWER_MACHINE } from '@/app/lib/cli/viewer/constants';
import { keyboardEvent, measureDiagram, viewerStatusText } from '@/app/lib/cli/viewer/utils';

const key: Key = {
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  home: false,
  end: false,
  return: false,
  escape: false,
  ctrl: false,
  shift: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
  super: false,
  hyper: false,
  capsLock: false,
  numLock: false,
};

test.each([
  ['h', 'leftArrow', -1, 0],
  ['l', 'rightArrow', 1, 0],
  ['k', 'upArrow', 0, -1],
  ['j', 'downArrow', 0, 1],
] as const)('maps %s and its arrow key to the same scroll event', (input, arrow, x, y) => {
  const arrowKey = Object.assign({}, key, { [arrow]: true });
  const event = { type: 'scroll', x, y };
  expect(keyboardEvent(input, key, 20)).toEqual(event);
  expect(keyboardEvent('', arrowKey, 20)).toEqual(event);
});

test('maps paging and quit keys', () => {
  const pageDown = Object.assign({}, key, { pageDown: true });
  const ctrl = Object.assign({}, key, { ctrl: true });
  expect(keyboardEvent('', pageDown, 20)).toEqual({ type: 'scroll', x: 0, y: 20 });
  expect(keyboardEvent('q', key, 20)).toEqual({ type: 'quit' });
  expect(keyboardEvent('c', ctrl, 20)).toEqual({ type: 'quit' });
  expect(keyboardEvent('h', ctrl, 20)).toBeUndefined();
});

test('clamps both scroll axes and reclamps when the viewport grows', () => {
  const input = { contentWidth: 196, contentHeight: 66, width: 79, height: 22, left: 0, top: 0 };
  const actor = createActor(VIEWER_MACHINE, { input }).start();
  try {
    actor.send({ type: 'scroll', x: 999, y: 999 });
    expect(actor.getSnapshot().context).toMatchObject({ left: 117, top: 44 });
    actor.send({ type: 'resize', width: 219, height: 73 });
    expect(actor.getSnapshot().context).toMatchObject({ left: 0, top: 0 });
    actor.send({ type: 'scroll', x: -5, y: -5 });
    expect(actor.getSnapshot().context).toMatchObject({ left: 0, top: 0 });
    actor.send({ type: 'quit' });
    expect(actor.getSnapshot().status).toBe('done');
  } finally {
    actor.stop();
  }
});

test('measures terminal cells without counting ANSI escape sequences', () => {
  expect(measureDiagram('\u001b[36m中文\u001b[0m\nabc')).toEqual({
    contentWidth: 4,
    contentHeight: 2,
  });
});

test('maps the save shortcut without accepting modified keys', () => {
  const ctrl = Object.assign({}, key, { ctrl: true });
  expect(keyboardEvent('s', key, 20)).toEqual({ type: 'save' });
  expect(keyboardEvent('s', ctrl, 20)).toBeUndefined();
});

test('adds save to the existing scroll footer without removing navigation or position', () => {
  const context = { contentWidth: 59, contentHeight: 22, width: 59, height: 22, left: 0, top: 0 };
  const svgExport = { source: 'flowchart TD\n A-->B', path: 'example.svg' };
  const exporting = Object.assign({}, context, { svgExport });
  const original = viewerStatusText(context);
  const withSave = viewerStatusText(exporting);
  expect(withSave.replace(' | s save SVG', '')).toBe(original);
  expect(withSave).toContain('arrows / hjkl scroll');
  expect(withSave).toContain('1,1 | 59x22');
  expect(withSave.length).toBeLessThanOrEqual(60);
});

test('ignores save in a viewer without an SVG export', () => {
  const input = { contentWidth: 10, contentHeight: 10, width: 20, height: 20, left: 0, top: 0 };
  const actor = createActor(VIEWER_MACHINE, { input }).start();
  actor.send({ type: 'save' });
  expect(actor.getSnapshot().value).toBe('viewing');
  expect(actor.getSnapshot().context.message).toBeUndefined();
  actor.stop();
});

test('waits for one save to finish before accepting another', async () => {
  const pending = Promise.withResolvers<void>();
  const save = vi.fn(() => pending.promise);
  const machine = VIEWER_MACHINE.provide({ actors: { saveSvg: fromPromise(save) } });
  const svgExport = { source: 'flowchart TD\n A-->B', path: 'example.svg' };
  const input = {
    contentWidth: 10,
    contentHeight: 10,
    width: 20,
    height: 20,
    left: 0,
    top: 0,
    svgExport,
  };
  const actor = createActor(machine, { input }).start();
  try {
    actor.send({ type: 'save' });
    actor.send({ type: 'save' });
    expect(actor.getSnapshot().value).toBe('saving');
    expect(actor.getSnapshot().context.message).toBe('Saving SVG...');
    expect(save).toHaveBeenCalledOnce();
    pending.resolve();
    await waitFor(actor, (snapshot) => snapshot.matches('viewing'));
    expect(actor.getSnapshot().context.message).toBe('Saved example.svg');
    actor.send({ type: 'save' });
    await waitFor(actor, (snapshot) => snapshot.matches('viewing'));
    expect(save).toHaveBeenCalledTimes(2);
  } finally {
    actor.stop();
  }
});
