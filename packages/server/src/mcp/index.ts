import { randomUUID } from 'node:crypto';
import { createMcpHandler, McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { Effect, Option, Schema } from 'effect';
import { JSDOM } from 'jsdom';
import { z } from 'zod';
import project from '@/package.json' with { type: 'json' };
import serverPackage from '../../package.json' with { type: 'json' };
import { DEFAULT_SETTINGS, GRAPH_DIAGRAM_TYPES } from '@/app/graph/constants';
import { encodeSnapshot } from '@/app/graph/snapshot';
import { SnapshotElementsSchema } from '@/app/graph/snapshot/constants';
import type { createAuth } from '../auth';
import { assertLiveAccount, createAccountAdmission } from '../auth/utils';
import type { VerifiedAccount } from '../auth/types';
import { prepareSave, saveSnapshot } from '../auth/clients/github';
import { getGitHubAccess } from '../auth/clients/github/utils';
import { graphInput, textInput, type RenderJob } from './types';
import { runRender } from './utils';

const textResult = z.object({ text: z.string() });
const graphResult = Schema.Struct({
  diagramType: Schema.Literals(GRAPH_DIAGRAM_TYPES),
  elements: SnapshotElementsSchema,
  svg: Schema.String,
});
const readGraph = Schema.decodeUnknownEffect(graphResult, { onExcessProperty: 'error' });
const graphOutput = z.strictObject({
  url: z.url(),
  gistId: z.string(),
  revision: z.string(),
  fileName: z.string(),
});
const mcpOptions = { legacy: 'reject' } as const;
const serverInfo = { name: serverPackage.name, version: project.version };

export const createMcp = (
  auth: ReturnType<typeof createAuth>,
  admit: ReturnType<typeof createAccountAdmission>,
) => {
  return (request: Request, account: VerifiedAccount) => {
    const handler = createMcpHandler(() => {
      const server = new McpServer(serverInfo);
      server.registerTool(
        'render_text',
        {
          description: 'Render Mermaid as Unicode or ASCII text.',
          inputSchema: textInput,
        },
        (input) =>
          runTool(
            admit(account.id, (charge) =>
              renderText({ ...input, tool: 'text' }, request.signal, charge),
            ),
          ),
      );
      server.registerTool(
        'create_graph',
        {
          description:
            'Create a graph and save it to an unlisted GitHub Gist. Anyone with the link can view it.',
          inputSchema: graphInput,
          outputSchema: graphOutput,
        },
        (input) =>
          runTool(
            admit(account.id, (charge) =>
              createGraph({ auth, account }, { ...input, tool: 'graph' }, request.signal, charge),
            ),
          ),
      );
      return server;
    }, mcpOptions);
    return handler.fetch(request);
  };
};

const runTool = async (
  operation: Effect.Effect<CallToolResult, Error>,
): Promise<CallToolResult> => {
  try {
    return await Effect.runPromise(operation);
  } catch (error) {
    const text = error instanceof Error ? error.message : 'The operation could not be completed.';
    return { isError: true, content: [{ type: 'text', text }] };
  }
};

const renderText = (job: RenderJob, signal: AbortSignal, charge: () => void) =>
  runRender(job, signal, charge).pipe(
    Effect.flatMap(requireRender),
    Effect.map((output): CallToolResult => {
      const { text } = textResult.parse(output);
      return { content: [{ type: 'text', text }] };
    }),
  );

const createGraph = (
  { auth, account }: { auth: ReturnType<typeof createAuth>; account: VerifiedAccount },
  job: Extract<RenderJob, { tool: 'graph' }>,
  signal: AbortSignal,
  charge: () => void,
) =>
  Effect.gen(function* () {
    const access = yield* Effect.tryPromise({
      try: () => getGitHubAccess(auth, account),
      catch: operationError,
    });
    const result = yield* runRender(job, signal, charge).pipe(
      Effect.flatMap(requireRender),
      Effect.flatMap(readGraph),
      Effect.mapError(operationError),
    );
    const text = yield* encodeRenderedGraph(job, result);
    return yield* Effect.tryPromise({
      try: async () => {
        const prepared = await prepareSave({ snapshot: text }, access, signal);
        await assertLiveAccount(auth, account);
        const saved = prepared.existing ?? (await saveSnapshot(prepared, access, signal));
        return graphResponse(saved, result.svg);
      },
      catch: operationError,
    });
  });

const encodeRenderedGraph = (
  job: Extract<RenderJob, { tool: 'graph' }>,
  { diagramType, elements, svg }: Schema.Schema.Type<typeof graphResult>,
) => {
  const records = newGraphRecords(job, { diagramType, elements });
  return Effect.acquireUseRelease(
    Effect.sync(() => new JSDOM().window),
    (window) => encodeSnapshot({ records, svg, saveId: randomUUID(), ordinal: 1 }, window),
    (window) => Effect.sync(() => window.close()),
  );
};

const newGraphRecords = (
  job: Extract<RenderJob, { tool: 'graph' }>,
  { diagramType, elements }: Omit<Schema.Schema.Type<typeof graphResult>, 'svg'>,
) => {
  const timestamp = new Date().toISOString();
  const id = randomUUID();
  const inputId = randomUUID();
  const translationId = randomUUID();
  const name = job.title ?? 'Untitled graph';
  return {
    input: {
      id: inputId,
      workspaceId: id,
      source: job.source,
      updatedAt: timestamp,
      version: 1,
      format: 'mermaid' as const,
    },
    translation: {
      id: translationId,
      inputId,
      updatedAt: timestamp,
      diagramType,
      elements,
      settings: DEFAULT_SETTINGS,
      view: {},
      error: null,
    },
    workspace: {
      id,
      activeInputId: inputId,
      activeTranslationId: translationId,
      updatedAt: timestamp,
      name,
    },
  };
};

const graphResponse = (saved: z.infer<typeof graphOutput>, svg: string): CallToolResult => {
  const blob = Buffer.from(svg, 'utf8').toString('base64');
  const { url, gistId, revision, fileName } = saved;
  return {
    structuredContent: { url, gistId, revision, fileName },
    content: [
      { type: 'text', text: url },
      { type: 'resource', resource: { uri: url, mimeType: 'image/svg+xml', blob } },
    ],
  };
};

const requireRender = (output: Option.Option<unknown>) => {
  if (Option.isNone(output)) return Effect.fail(new Error('A render is already in progress.'));
  return Effect.succeed(output.value);
};

const operationError = (cause: unknown) =>
  cause instanceof Error ? cause : new Error('The operation could not be completed.');
