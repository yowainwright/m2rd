import { Cause, Effect, Exit } from 'effect';

export const runOperation = <Value>(
  operation: Effect.Effect<Value, Error>,
  signal: AbortSignal,
) => {
  return Effect.runPromiseExit(operation, { signal }).then((result) => {
    if (signal.aborted) return new Promise<Value>(() => {});
    if (Exit.isSuccess(result)) return result.value;
    throw Cause.squash(result.cause);
  });
};
