import { Effect } from 'effect';
import type { CliOptions, RenderedMermaid } from '../../types';
import { errorMessage } from '../../utils';
import { renderBoxGraph } from '../flowchart';
import { readState } from './utils';

export const renderState = (diagram: RenderedMermaid, options: CliOptions) =>
  Effect.try({ try: () => readState(diagram), catch: errorMessage }).pipe(
    Effect.flatMap((graph) => renderBoxGraph(graph, options)),
  );
