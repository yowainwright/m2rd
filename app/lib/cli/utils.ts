import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { createElement } from 'react';
import { Text, renderToString } from 'ink';
import { Effect } from 'effect';
import { Lexer } from 'marked';
import type { Token, Tokens } from 'marked';
import { Panel } from '@/app/components/ui/panel';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { createHTMLWindow } from 'svgdom';
import mermaid from 'mermaid';
import type { MermaidConfig } from 'mermaid';
import mermaidMetadata from 'mermaid/package.json' with { type: 'json' };
import { DEFAULT_WIDTH, MAX_WIDTH, MIN_WIDTH, MERMAID_RENDER_ID } from './constants';
import { renderFlowchart } from './renders/flowchart';
import { renderSequence } from './renders/sequence';
import { renderState } from './renders/state';
import { showViewer } from './viewer';
import { svgTheme } from './themes/mermaid/constants';
import type { CliDiagram, CliOptions, RenderedMermaid } from './types';

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

const initializeMermaid = (config: MermaidConfig = {}) => {
  const sanitizingWindow = new JSDOM('').window;
  Object.assign(createDOMPurify, createDOMPurify(sanitizingWindow));
  const window = createHTMLWindow();
  Object.assign(window, { Error, Math, Array, Function, CSS: sanitizingWindow.CSS });
  Object.assign(globalThis, {
    window,
    document: window.document,
    CSSStyleSheet: sanitizingWindow.CSSStyleSheet,
  });
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

export const readInput = (path?: string, allowEmpty = false) => {
  const inputRequired = !path && process.stdin.isTTY;
  if (inputRequired)
    return Effect.fail('Input required. Pipe Mermaid or Markdown text, or provide a file.');
  const read = path ? () => readFile(path, 'utf8') : readStdin;
  return Effect.tryPromise({ try: read, catch: errorMessage }).pipe(
    Effect.filterOrFail(
      (value) => allowEmpty || value.trim().length > 0,
      () => 'Input is empty. Provide Mermaid text.',
    ),
  );
};

const tokenDiagrams = (token: Token): string[] => {
  if (token.type === 'blockquote') return mermaidBlocks(token.tokens ?? []);
  if (token.type === 'list')
    return token.items.flatMap((item: Tokens.ListItem) => mermaidBlocks(item.tokens));
  if (token.type !== 'code') return [];
  const language = token.lang?.trim().split(/\s+/)[0];
  if (language !== 'mermaid') return [];
  return [token.text];
};

const mermaidBlocks = (tokens: Token[]): string[] => tokens.flatMap(tokenDiagrams);

const isMarkdown = (path = '') => /\.(md|markdown)$/i.test(extname(path));

const extractDiagrams = (source: string, path?: string): CliDiagram[] => {
  const blocks = mermaidBlocks(Lexer.lex(source));
  const markdown = isMarkdown(path) || blocks.length > 0;
  const sources = markdown ? blocks : [source];
  const label = cleanText(path ?? 'stdin');
  return sources.map((source) => ({ source, label }));
};

const readDocument = (path?: string) =>
  readInput(path, isMarkdown(path)).pipe(
    Effect.flatMap((source) =>
      Effect.try({ try: () => extractDiagrams(source, path), catch: errorMessage }),
    ),
  );

export const readDiagrams = (input: string | string[] | undefined) => {
  const paths = Array.isArray(input) ? input : [input];
  const inputs = paths.length > 0 ? paths : [undefined];
  return Effect.forEach(inputs, readDocument, { concurrency: 1 }).pipe(
    Effect.map((documents) => documents.flat()),
    Effect.filterOrFail(
      (diagrams) => diagrams.length > 0,
      () => 'No Mermaid diagrams found. Add a fenced mermaid block or pipe Mermaid text.',
    ),
  );
};

export const renderDiagram = (source: string, options: CliOptions) =>
  renderMermaid(source).pipe(
    Effect.flatMap((diagram) => {
      if (diagram.family === 'sequence') return renderSequence(diagram, options);
      if (diagram.family === 'state') return renderState(diagram, options);
      return renderFlowchart(diagram, options);
    }),
  );

const renderDocumentDiagram = ({ source, label }: CliDiagram, options: CliOptions) =>
  renderDiagram(source, options).pipe(
    Effect.map((diagram) => ({ diagram, label })),
    Effect.mapError((error) => `${label}: ${error}`),
  );

const presentDiagrams = (diagrams: CliDiagram[], options: CliOptions) => {
  if (options.output) {
    if (diagrams.length !== 1)
      return Effect.fail('--output requires exactly one diagram. Provide a single Mermaid block.');
    return exportSvg(diagrams[0].source, options.output);
  }
  return Effect.forEach(diagrams, (diagram) => renderDocumentDiagram(diagram, options), {
    concurrency: 1,
  }).pipe(Effect.flatMap((rendered) => showViewer(rendered, options.ascii)));
};

export const runCli = (paths: string | string[] | undefined, options: CliOptions) =>
  readDiagrams(paths).pipe(Effect.flatMap((diagrams) => presentDiagrams(diagrams, options)));

export const formatError = (message: string) => {
  const width = Math.max(MIN_WIDTH, Math.min(process.stderr.columns || DEFAULT_WIDTH, MAX_WIDTH));
  const title = createElement(Text, { bold: true, color: 'red' }, 'm2rd');
  const text = createElement(Text, null, cleanText(message));
  const panel = createElement(Panel, { borderColor: 'red', width }, title, text);
  return renderToString(panel, { columns: width });
};
