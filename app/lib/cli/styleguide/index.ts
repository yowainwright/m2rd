import { Effect } from 'effect';
import { renderDiagram } from '../index';
import { errorMessage, exportSvg } from '../utils';
import { showViewer } from '../viewer';
import type { CliOptions } from '../types';
import { STYLEGUIDE_EXAMPLE, STYLEGUIDE_EXPORT_PATH, STYLEGUIDE_VIEWPORT } from './constants';
import { styleguideColors, svgStyleguideSource } from './utils';

const formatStyleguide = (options: CliOptions) =>
  renderDiagram(STYLEGUIDE_EXAMPLE, options).pipe(
    Effect.map((diagram) => {
      const colors = styleguideColors(options);
      return `${diagram}\n\n${colors}`;
    }),
  );

const presentStyleguide = (content: string, options: CliOptions) => {
  const interactive = process.stdout.isTTY && !process.env.CI && !process.env.GITHUB_ACTIONS;
  if (interactive) {
    const source = svgStyleguideSource();
    const svgExport = { source, path: STYLEGUIDE_EXPORT_PATH };
    return showViewer(content, options.ascii, STYLEGUIDE_VIEWPORT, svgExport);
  }
  return Effect.try({
    try: () => {
      process.stdout.write(`${content}\n`);
    },
    catch: errorMessage,
  });
};

export const runStyleguide = (options: CliOptions) => {
  if (options.output) return exportSvg(svgStyleguideSource(), options.output);
  const width = Math.min(options.width, STYLEGUIDE_VIEWPORT.columns - 1);
  const compact = Object.assign({}, options, { width });
  return formatStyleguide(compact).pipe(
    Effect.flatMap((content) => presentStyleguide(content, options)),
  );
};
