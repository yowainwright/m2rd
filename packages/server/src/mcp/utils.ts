import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Effect, Semaphore } from 'effect';
import type { RenderJob } from './types';

const permit = Semaphore.makeUnsafe(1);
const executingSource = import.meta.url.endsWith('.ts');
const relativeEntry = executingSource ? '../../dist/render.mjs' : './render.mjs';
const childEntry = fileURLToPath(new URL(relativeEntry, import.meta.url));
const maxBytes = 2_097_152;
const renderDeadline = 10_000;

export const runRender = (job: RenderJob, signal: AbortSignal, admit: () => void) =>
  permit.withPermitsIfAvailable(1)(
    Effect.try({
      try: admit,
      catch: (cause) => (cause instanceof Error ? cause : renderFailure()),
    }).pipe(
      Effect.andThen(
        Effect.tryPromise({ try: () => renderInChild(job, signal), catch: renderFailure }),
      ),
      Effect.uninterruptible,
    ),
  );

const renderInChild = (job: RenderJob, signal: AbortSignal) =>
  new Promise<unknown>((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [childEntry],
      {
        env: { NODE_ENV: 'production' },
        killSignal: 'SIGKILL',
        timeout: renderDeadline,
        maxBuffer: maxBytes,
      },
      (error, stdout) => {
        signal.removeEventListener('abort', cancel);
        if (error) {
          reject(error);
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (cause) {
          reject(cause);
        }
      },
    );
    const cancel = () => {
      child.kill('SIGKILL');
    };
    child.stdin?.on('error', () => {});
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    child.stdin?.end(JSON.stringify(job));
  });

const renderFailure = () => new Error('The Mermaid diagram could not be rendered.');
