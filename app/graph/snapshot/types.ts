import type { WindowLike } from 'dompurify';
import type { Schema } from 'effect';
import type { GraphRecords } from '../types';
import type { SnapshotProvenanceSchema, SnapshotSchema } from './constants';

export type Snapshot = Schema.Schema.Type<typeof SnapshotSchema>;
export type SnapshotProvenance = Schema.Schema.Type<typeof SnapshotProvenanceSchema>;
export type SnapshotLink = Pick<SnapshotProvenance, 'gistId' | 'revision'>;
export type SnapshotRecords = Snapshot['records'];
export type SnapshotWindow = WindowLike & { DOMParser: typeof DOMParser };
export type EncodeSnapshotInput = {
  records: Omit<GraphRecords, 'versions'> & Partial<Pick<GraphRecords, 'versions'>>;
  svg: string;
  saveId: string;
  ordinal: number;
  forkedFrom?: SnapshotProvenance;
};
