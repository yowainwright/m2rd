import 'fake-indexeddb/auto';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import Home from '@/app/page';

vi.mock('next/dynamic', () => ({
  default: () => {
    return function DynamicEditor() {
      return createElement('textarea', { 'aria-label': 'Mermaid source' });
    };
  },
}));

const matchMedia = (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
});

const layoutRect = {
  bottom: 768,
  height: 768,
  left: 0,
  right: 1024,
  top: 0,
  width: 1024,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

describe('app startup', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads the app shell, editor, and graph output', () => {
    vi.stubGlobal('matchMedia', matchMedia);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(layoutRect);
    render(createElement(Home));

    expect(screen.getByRole('heading', { name: 'm2rd' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Mermaid input' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'React Flow output' })).toBeTruthy();
  });
});
