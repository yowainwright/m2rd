import { z } from 'zod';
import { MAX_SOURCE_BYTES } from '@/app/graph/snapshot/constants';

export type RenderJob = z.infer<typeof renderJob>;

const encoder = new TextEncoder();

export const sourceSchema = z.string().refine(isSource);
export const textInput = z.strictObject({
  source: sourceSchema,
  ascii: z.boolean().default(false),
  width: z.number().int().min(16).max(500).default(80),
});
export const graphInput = z.strictObject({
  source: sourceSchema,
  title: z.string().trim().min(1).max(120).optional(),
});
export const renderJob = z.discriminatedUnion('tool', [
  textInput.extend({ tool: z.literal('text') }),
  graphInput.extend({ tool: z.literal('graph') }),
]);

function isSource(source: string) {
  const present = source.trim().length > 0;
  const bounded = encoder.encode(source).byteLength <= MAX_SOURCE_BYTES;
  return present && bounded;
}
