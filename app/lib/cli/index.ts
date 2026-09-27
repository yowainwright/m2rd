import { createElement } from 'react';
import { Text, renderToString } from 'ink';
import { Effect } from 'effect';
import { Panel } from '@/app/components/ui/panel';
import { DEFAULT_WIDTH, MAX_WIDTH, MIN_WIDTH } from './constants';
import { cleanText, readInput, renderMermaid } from './utils';
import { renderFlowchart } from './renders/flowchart';
import { renderSequence } from './renders/sequence';
import { renderState } from './renders/state';
import { showViewer } from './viewer';
import type { CliOptions } from './types';

export const renderDiagram = (source: string, options: CliOptions) =>
  renderMermaid(source).pipe(
    Effect.flatMap((diagram) => {
      if (diagram.family === 'sequence') return renderSequence(diagram, options);
      if (diagram.family === 'state') return renderState(diagram, options);
      return renderFlowchart(diagram, options);
    }),
  );

export const runCli = (path: string | undefined, options: CliOptions) =>
  readInput(path).pipe(
    Effect.flatMap((source) => renderDiagram(source, options)),
    Effect.flatMap((diagram) => showViewer(diagram, options.ascii)),
  );

export const formatError = (message: string) => {
  const width = Math.max(MIN_WIDTH, Math.min(process.stderr.columns || DEFAULT_WIDTH, MAX_WIDTH));
  const title = createElement(Text, { bold: true, color: 'red' }, 'm2rd');
  const text = createElement(Text, null, cleanText(message));
  const panel = createElement(Panel, { borderColor: 'red', width }, title, text);
  return renderToString(panel, { columns: width });
};
