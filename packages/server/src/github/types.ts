import type { SnapshotLink, SnapshotProvenance } from '@/app/graph/snapshot';

export type GitHubAccess = { token: string; githubId: string };
export type SavedSnapshot = SnapshotProvenance & { url: string };
export type SaveRequest = {
  snapshot: string;
  target?: SnapshotLink;
  forkId?: string;
  reconcileOnly?: boolean;
};
