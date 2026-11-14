import pino, { type LogFn } from 'pino';
import { BROWSER_LOG_LEVEL, OBSERVABILITY_LOGGER_NAME, SERVER_LOG_LEVEL } from './constants';
import { redactTelemetry } from './redact';
import type {
  BrowserLoggerInput,
  BrowserLogWriter,
  ObservabilityLogger,
  ServerLoggerInput,
} from './types';

export const createBrowserLogger = (input: BrowserLoggerInput = {}) => {
  const write = (value: unknown) => {
    writeBrowserLog(value, input.write);
  };

  return pino({
    browser: {
      asObject: true,
      write,
    },
    hooks: { logMethod },
    level: input.level || BROWSER_LOG_LEVEL,
    name: OBSERVABILITY_LOGGER_NAME,
  });
};

export const writeBrowserLog = (value: unknown, writer = defaultBrowserWriter) => {
  writer(redactTelemetry(value));
};

export const createServerLogger = (input: ServerLoggerInput = {}) => {
  const options = {
    hooks: { logMethod },
    level: input.level || SERVER_LOG_LEVEL,
    name: OBSERVABILITY_LOGGER_NAME,
  };

  if (input.destination) {
    return pino(options, input.destination);
  }

  return pino(options);
};

const defaultBrowserWriter: BrowserLogWriter = (value) => {
  globalThis.console.info(value);
};

const logMethod = function redactedLogMethod(
  this: ObservabilityLogger,
  args: Parameters<LogFn>,
  method: LogFn,
) {
  method.apply(this, redactLogArguments(args));
};

function redactLogArguments(args: Parameters<LogFn>) {
  return args.map((arg) => redactTelemetry(arg)) as Parameters<LogFn>;
}
