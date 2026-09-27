import { createElement } from 'react';
import { Text } from 'ink';
import { Effect } from 'effect';
import { renderDiagram } from '../index';
import { errorMessage, exportSvg } from '../utils';
import { showViewer } from '../viewer';
import type { CliOptions } from '../types';
import { STYLEGUIDE_EXAMPLES } from './constants';
import { styleguidePanel, styleguideTokens, svgStyleguideSource } from './utils';

const renderExample = (example: (typeof STYLEGUIDE_EXAMPLES)[number], options: CliOptions) =>
  renderDiagram(example.source, options).pipe(
    Effect.map((diagram) => `${example.title}\n\n${diagram}`),
  );

const formatStyleguide = (options: CliOptions) =>
  Effect.forEach(STYLEGUIDE_EXAMPLES, (example) => renderExample(example, options)).pipe(
    Effect.map((examples) => {
      const description = createElement(Text, null, 'Terminal components and Mermaid SVG defaults');
      const header = styleguidePanel('m2rd styleguide', description, options);
      const tokens = styleguideTokens(options);
      return [header, tokens].concat(examples).join('\n\n');
    }),
  );

const presentStyleguide = (content: string, options: CliOptions) => {
  const interactive = process.stdout.isTTY && !process.env.CI && !process.env.GITHUB_ACTIONS;
  if (interactive) return showViewer(content, options.ascii);
  return Effect.try({
    try: () => {
      process.stdout.write(`${content}\n`);
    },
    catch: errorMessage,
  });
};

export const runStyleguide = (options: CliOptions) => {
  if (options.output) return exportSvg(svgStyleguideSource(), options.output);
  return formatStyleguide(options).pipe(
    Effect.flatMap((content) => presentStyleguide(content, options)),
  );
};
