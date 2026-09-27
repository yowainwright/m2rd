#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { Effect } from 'effect';
import { CLI_HELP, DEFAULT_WIDTH, MAX_WIDTH, MIN_WIDTH } from './constants';

const parseOptions = () => {
  const options = {
    ascii: { type: 'boolean' },
    width: { type: 'string' },
    color: { type: 'boolean' },
    'no-color': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  } as const;
  const { values, positionals } = parseArgs({ options, allowPositionals: true });
  const conflict = values.color && values['no-color'];
  if (conflict) throw new Error('Choose either --color or --no-color.');
  if (positionals.length > 1)
    throw new Error('Provide one Mermaid file, or pipe Mermaid through stdin.');
  if (values.color) {
    process.env.FORCE_COLOR = '1';
    delete process.env.NO_COLOR;
  }
  if (values['no-color']) process.env.FORCE_COLOR = '0';
  const width = Number(values.width ?? process.stdout.columns ?? DEFAULT_WIDTH);
  const validWidth = Number.isInteger(width) && width >= MIN_WIDTH && width <= MAX_WIDTH;
  if (!validWidth) throw new Error(`--width must be an integer from ${MIN_WIDTH} to ${MAX_WIDTH}.`);
  const path = positionals[0] === '-' ? undefined : positionals[0];
  return { path, help: values.help, width, ascii: values.ascii ?? false };
};

const main = async () => {
  const options = parseOptions();
  if (options.help) {
    process.stdout.write(`${CLI_HELP}\n`);
    return;
  }
  const { runCli, formatError } = await import('./index');
  const result = await Effect.runPromise(Effect.either(runCli(options.path, options)));
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
    const { formatError } = await import('./index');
    process.stderr.write(`${formatError(message)}\n`);
  } catch {
    process.stderr.write(`m2rd: ${message}\n`);
  }
});
