import { Effect } from 'effect';
import { DEFAULT_SETTINGS } from '@/app/graph/constants';
import { renderGraph } from '@/app/graph/render';
import { initializeMermaid, renderDiagram, renderSvgSource } from '@/packages/cli/src/utils';
import { renderJob, type RenderJob } from '../mcp/types';

const maxTextBytes = 1_048_576;

const run = async () => {
  process.stdin.setEncoding('utf8');
  const chunks = await process.stdin.toArray();
  const input = renderJob.parse(JSON.parse(chunks.join('')));
  const output = await render(input);
  process.stdout.write(JSON.stringify(output));
};

const render = async (input: RenderJob) => {
  if (input.tool === 'graph') return renderWorkspace(input.source);
  const text = await Effect.runPromise(renderDiagram(input.source, input));
  if (Buffer.byteLength(text) > maxTextBytes) throw new Error('Text exceeds the output limit.');
  return { text };
};

const renderWorkspace = async (source: string) => {
  const window = initializeMermaid();
  const result = await renderGraph(source, DEFAULT_SETTINGS, window.document);
  window.close();
  const svg = await renderSvgSource(source);
  return { ...result, svg };
};

try {
  await run();
} catch (error) {
  if (process.env.NODE_ENV === 'development') console.error(error);
  process.exitCode = 1;
}
