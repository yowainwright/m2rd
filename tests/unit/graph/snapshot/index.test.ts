import { Effect } from 'effect';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/app/graph/constants';
import { decodeSnapshot, encodeSnapshot } from '@/app/graph/snapshot';

const { window: dom } = new JSDOM();
const saveId = 'be477cbb-b069-46fb-b456-fa15a12ffac4';
const timestamp = '2026-11-17T12:00:00.000Z';
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject width="120" height="24"><div xmlns="http://www.w3.org/1999/xhtml" style="background-color: blue">Edited</div></foreignObject></svg>';
const records = {
  input: {
    id: 'input',
    format: 'mermaid' as const,
    source: 'flowchart LR\nA --> B',
    updatedAt: timestamp,
    version: 2,
    workspaceId: 'workspace',
  },
  translation: {
    id: 'translation',
    inputId: 'input',
    updatedAt: timestamp,
    diagramType: 'flowchart' as const,
    error: null,
    settings: DEFAULT_SETTINGS,
    view: { viewport: { x: 1, y: 2, zoom: 1.5 } },
    elements: {
      nodes: [
        {
          id: 'A',
          position: { x: 14, y: 20 },
          data: { label: 'Edited' },
          style: { backgroundColor: 'blue' },
        },
        { id: 'B', position: { x: 30, y: 40 }, data: { label: 'B' } },
      ],
      edges: [{ id: 'A-B', source: 'A', target: 'B', label: 'Route' }],
    },
  },
  workspace: {
    id: 'workspace',
    name: 'My graph',
    updatedAt: timestamp,
    activeInputId: 'input',
    activeTranslationId: 'translation',
  },
  versions: [{ id: 'previous', updatedAt: timestamp, version: 1 }],
};

describe('graph snapshots', () => {
  it('preserves the edited records and SVG while excluding local version history', async () => {
    const input = { records, svg, saveId, ordinal: 1 };
    const encoded = await Effect.runPromise(encodeSnapshot(input, dom));
    const decoded = await Effect.runPromise(decodeSnapshot(encoded, dom));
    const { input: source, translation, workspace } = records;
    expect(decoded).toEqual({
      format: 'm2rd.snapshot',
      schemaVersion: 1,
      saveId,
      ordinal: 1,
      records: { input: source, translation, workspace },
      svg: { mimeType: 'image/svg+xml', text: svg },
    });
  });

  it('rejects unsupported fields and broken edge references', async () => {
    const input = { records, svg, saveId, ordinal: 1 };
    const encoded = await Effect.runPromise(encodeSnapshot(input, dom));
    const unsupported = encoded.replace('"label":"Edited"', '"label":"Edited","extra":true');
    const disconnected = encoded.replace('"target":"B"', '"target":"missing"');
    await expect(Effect.runPromise(decodeSnapshot(unsupported, dom))).rejects.toThrow();
    await expect(Effect.runPromise(decodeSnapshot(disconnected, dom))).rejects.toThrow();
  });

  it.each([
    '<script>void(0)</script>',
    '<rect onload="void(0)"/>',
    '<image href="https://example.com/image.png"/>',
    '<style>@import "https://example.com/style.css";</style>',
    '<rect style="fill:url(https://example.com/image.svg#red)"/>',
  ])('rejects active SVG content %s', async (content) => {
    const unsafeSvg = `<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
    const input = { records, svg: unsafeSvg, saveId, ordinal: 1 };
    await expect(Effect.runPromise(encodeSnapshot(input, dom))).rejects.toThrow(/SVG/);
  });
});
