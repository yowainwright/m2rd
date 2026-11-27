import { Cache, Effect, Exit, Option } from 'effect';
import { AdmissionError } from '../utils';

type ReadLimits = { perHour: number; perPeer: number };

const hourMs = 3_600_000;

export const createCachedSnapshotReader = <A>(
  loadRevision: (key: string) => Effect.Effect<A, Error>,
  limits: ReadLimits,
) => {
  const charge = createPublicReadBudget(limits);
  const cache = Effect.runSync(
    Cache.makeWith(loadRevision, {
      capacity: 24,
      timeToLive: (exit) => (Exit.isSuccess(exit) ? '5 minutes' : 0),
    }),
  );
  return (key: string, peer: string, signal: AbortSignal) => {
    const read = Effect.gen(function* () {
      const existing = yield* Cache.getOption(cache, key);
      if (Option.isSome(existing)) return existing.value;
      charge(peer);
      return yield* Cache.get(cache, key);
    });
    return Effect.runPromise(read, { signal });
  };
};

const createPublicReadBudget = (limits: ReadLimits) => {
  let recent: { peer: string; time: number }[] = [];
  return (peer: string) => {
    const now = performance.now();
    const active = recent.filter(({ time }) => now - time < hourMs);
    const peerReads = active.filter((entry) => entry.peer === peer).length;
    const exhausted = peerReads >= limits.perPeer || active.length >= limits.perHour;
    if (exhausted) {
      throw new AdmissionError('Snapshot read limit reached. Retry later.');
    }
    recent = [...active, { peer, time: now }];
  };
};
