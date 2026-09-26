// @vitest-environment node
import { createActor } from 'xstate';
import { expect, test } from 'vitest';
import type { Key } from 'ink';
import { VIEWER_MACHINE } from '@/app/lib/cli/viewer/constants';
import { keyboardEvent, measureDiagram } from '@/app/lib/cli/viewer/utils';

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
