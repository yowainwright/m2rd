import { readFile, writeFile } from 'node:fs/promises';
import { stripVTControlCharacters } from 'node:util';
import { Effect } from 'effect';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { createHTMLWindow } from 'svgdom';
import mermaid from 'mermaid';
import type { MermaidConfig } from 'mermaid';
import mermaidMetadata from 'mermaid/package.json' with { type: 'json' };
import { MERMAID_RENDER_ID } from './constants';
import { svgTheme } from './themes/mermaid/constants';
import type { RenderedMermaid } from './types';

export const cleanText = (value: string) => {
  const lines = stripVTControlCharacters(value).split('\n');
  return lines
    .map((line) => line.replace(/\p{Cc}/gu, ' '))
    .join('\n')
    .trim();
};

export const errorMessage = (cause: unknown): string => {
  if (cause instanceof Error) return cleanText(cause.message);
  return cleanText(String(cause));
};

// https://github.com/mermaid-js/mermaid/issues/6634
// https://github.com/tani/isomorphic-mermaid/issues/5
const initializeMermaid = (config: MermaidConfig = {}) => {
  const sanitizingWindow = new JSDOM('').window;
  Object.assign(createDOMPurify, createDOMPurify(sanitizingWindow));
  const window = createHTMLWindow();
  const CSS = sanitizingWindow.CSS;
  Object.assign(window, { Error, Math, Array, Function, CSS });
  const document = window.document;
  const CSSStyleSheet = sanitizingWindow.CSSStyleSheet;
  Object.assign(globalThis, { window, document, CSSStyleSheet });
  mermaid.initialize(
    Object.assign({}, config, {
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      suppressErrorRendering: true,
    }),
  );
  return sanitizingWindow;
};

// SequenceDB exposes these collections in Mermaid's shipped sequenceDb.d.ts.
const validateSequenceData = (db: object) => {
  const collections = ['getBoxes', 'getCreatedActors', 'getDestroyedActors'];
  const unsupported = collections.some((name) => {
    const read = Reflect.get(db, name);
    if (typeof read !== 'function') throw new Error(`Missing Mermaid sequence API: ${name}.`);
    const entries: unknown = read.call(db);
    if (entries instanceof Map) return entries.size > 0;
    const populated = Array.isArray(entries) && entries.length > 0;
    return populated;
  });
  if (unsupported)
    throw new Error(
      'Sequence participant groups and creation/destruction are not supported in this preview yet.',
    );
};

const readDiagramData = async (source: string, family: RenderedMermaid['family']) => {
  const diagram = await mermaid.mermaidAPI.getDiagramFromText(source);
  if (family === 'sequence') {
    validateSequenceData(diagram.db);
    return undefined;
  }
  const getData = 'getData' in diagram.db ? diagram.db.getData : undefined;
  if (typeof getData !== 'function') throw new Error('Mermaid did not expose diagram data.');
  return getData.call(diagram.db) as unknown;
};

// Follow app/graph/state: render and read data from the same Diagram instance.
const renderStateSource = async (source: string): Promise<RenderedMermaid> => {
  const host = document.createElement('div');
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  element.id = MERMAID_RENDER_ID;
  element.append(document.createElementNS('http://www.w3.org/2000/svg', 'g'));
  host.append(element);
  document.body.append(host);
  try {
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(source);
    await diagram.render(MERMAID_RENDER_ID, mermaidMetadata.version);
    const getData = 'getData' in diagram.db ? diagram.db.getData : undefined;
    if (typeof getData !== 'function') throw new Error('Mermaid did not expose state data.');
    const data: unknown = getData.call(diagram.db);
    const svg = new JSDOM(element.outerHTML, { contentType: 'image/svg+xml' }).window.document;
    return { family: 'state', svg, data };
  } finally {
    host.remove();
  }
};

const renderMermaidSource = async (source: string): Promise<RenderedMermaid> => {
  const sanitizingWindow = initializeMermaid();
  try {
    const parsed = await mermaid.parse(source);
    if (parsed.diagramType === 'stateDiagram') return await renderStateSource(source);
    const flowchart = parsed.diagramType.startsWith('flowchart');
    const supported = flowchart || parsed.diagramType === 'sequence';
    if (!supported) throw new Error(`The CLI preview does not support ${parsed.diagramType} yet.`);
    const family = flowchart ? 'flowchart' : 'sequence';
    const data = await readDiagramData(source, family);
    const rendered = await mermaid.render(MERMAID_RENDER_ID, source);
    const svg = new JSDOM(rendered.svg, { contentType: 'image/svg+xml' }).window.document;
    return { family, svg, data };
  } finally {
    sanitizingWindow.close();
  }
};

export const renderMermaid = (source: string) =>
  Effect.tryPromise({ try: () => renderMermaidSource(source), catch: errorMessage });

// SVGDOM lacks parentElement, which Mermaid's Gantt renderer reads for sizing.
// https://dom.spec.whatwg.org/#dom-node-parentelement
const enableParentElement = () => {
  const NodeConstructor: typeof Node = Reflect.get(window, 'Node');
  const prototype = NodeConstructor.prototype;
  if ('parentElement' in prototype) return;
  Object.defineProperty(prototype, 'parentElement', {
    configurable: true,
    get(this: Element) {
      const parent = this.parentNode;
      if (parent?.nodeType === 1) return parent;
      return null;
    },
  });
};

const renderSvgSource = async (source: string) => {
  const sanitizingWindow = initializeMermaid(svgTheme);
  try {
    enableParentElement();
    const rendered = await mermaid.render('m2rd-image', source);
    return rendered.svg;
  } finally {
    sanitizingWindow.close();
  }
};

export const exportSvg = (source: string, output: string) =>
  Effect.tryPromise({ try: () => renderSvgSource(source), catch: errorMessage }).pipe(
    Effect.flatMap((svg) =>
      Effect.tryPromise({
        try: () => writeFile(output, svg, { encoding: 'utf8', flag: 'wx' }),
        catch: errorMessage,
      }),
    ),
  );

const readStdin = async () => {
  process.stdin.setEncoding('utf8');
  const chunks = await process.stdin.toArray();
  return chunks.join('');
};

export const readInput = (path?: string) => {
  const inputRequired = !path && process.stdin.isTTY;
  if (inputRequired)
    return Effect.fail('Input required. Pipe Mermaid text or provide a .mmd path.');
  const read = path ? () => readFile(path, 'utf8') : readStdin;
  return Effect.tryPromise({ try: read, catch: errorMessage }).pipe(
    Effect.filterOrFail(
      (value) => value.trim().length > 0,
      () => 'Input is empty. Provide Mermaid text.',
    ),
  );
};
