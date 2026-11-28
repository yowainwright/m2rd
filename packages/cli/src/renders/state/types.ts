import type { Schema } from 'effect';
import type { StateLayoutSchema, StateNodeSchema } from '@/app/graph/state/constants';

export type StateLayout = Schema.Schema.Type<typeof StateLayoutSchema>;
export type StateNode = Schema.Schema.Type<typeof StateNodeSchema>;
