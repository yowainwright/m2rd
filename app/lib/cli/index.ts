#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { Effect } from 'effect';
import { CLI_HELP, DEFAULT_WIDTH, MAX_WIDTH, MIN_WIDTH } from './constants';

const parseOptions = () => {
  const options = {
    ascii: { type: 'boolean' },
    width: { type: 'string' },
    output: { type: 'string', short: 'o' },
    styleguide: { type: 'boolean' },
    color: { type: 'boolean' },
    'no-color': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  } as const;
  const { values, positionals } = parseArgs({ options, allowPositionals: true });
  const conflict = values.color && values['no-color'];
  if (conflict) throw new Error('Choose either --color or --no-color.');
  const mixedStdin = positionals.includes('-') && positionals.length > 1;
  if (mixedStdin) throw new Error('Use stdin alone, or provide one or more input files.');
  const styleguide = values.styleguide ?? false;
  const hasStyleguideInput = styleguide && positionals.length > 0;
  if (hasStyleguideInput)
    throw new Error('--styleguide uses built-in examples; omit the input file.');
  if (values.color) {
    process.env.FORCE_COLOR = '1';
    delete process.env.NO_COLOR;
  }
  if (values['no-color']) process.env.FORCE_COLOR = '0';
  const width = Number(values.width ?? process.stdout.columns ?? DEFAULT_WIDTH);
  const validWidth = Number.isInteger(width) && width >= MIN_WIDTH && width <= MAX_WIDTH;
  if (!validWidth) throw new Error(`--width must be an integer from ${MIN_WIDTH} to ${MAX_WIDTH}.`);
  const paths = positionals.filter((path) => path !== '-');
  const output = values.output;
  const invalidOutput = output !== undefined && !output.toLowerCase().endsWith('.svg');
  if (invalidOutput)
    throw new Error('--output must be a .svg file. CLI image export supports SVG.');
  return { paths, help: values.help, width, ascii: values.ascii ?? false, output, styleguide };
};

const main = async () => {
  const options = parseOptions();
  if (options.help) {
    process.stdout.write(`${CLI_HELP}\n`);
    return;
  }
  const { runCli, formatError } = await import('./utils');
  const { runStyleguide } = await import('./styleguide');
  const operation = options.styleguide ? runStyleguide(options) : runCli(options.paths, options);
  const result = await Effect.runPromise(Effect.either(operation));
  if (result._tag === 'Left') {
    process.stderr.write(`${formatError(result.left)}\n`);
    process.exitCode = 1;
    return;
  }
};

main().catch(async (cause: unknown) => {
  process.exitCode = 1;
  const message = cause instanceof Error ? cause.message : String(cause);
  try {
    const { formatError } = await import('./utils');
    process.stderr.write(`${formatError(message)}\n`);
  } catch {
    process.stderr.write(`m2rd: ${message}\n`);
  }
});
