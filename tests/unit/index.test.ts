import 'fake-indexeddb/auto';
import { createActor, fromPromise, type ActorRefFrom } from 'xstate';
import { afterEach, expect, it, vi } from 'vitest';
import { appMachine } from '@/app';
import { APP_INITIAL_CONTEXT, GRAPH_SAMPLES } from '@/app/constants';
import type { GraphRecords, GraphRenderResult, GraphWorkspace } from '@/app/graph';
import type { GraphExportResult } from '@/app/export';
import type { AppContext, LoadedWorkspace } from '@/app/types';
import type { SavedWorkspace } from '@/app/state/types';

const rendered: GraphRenderResult = {
  diagramType: 'flowchart',
  elements: { nodes: [{ id: 'A', data: { label: 'A' }, position: { x: 0, y: 0 } }], edges: [] },
};
const records: GraphRecords = {
  input: Object.assign({}, APP_INITIAL_CONTEXT.input, {
    id: 'saved-input',
    workspaceId: 'saved',
    version: 1,
  }),
  translation: Object.assign({}, APP_INITIAL_CONTEXT.translation, rendered, {
    id: 'saved-translation',
    inputId: 'saved-input',
  }),
  workspace: Object.assign({}, APP_INITIAL_CONTEXT.workspace, {
    id: 'saved',
    name: 'Saved',
    activeInputId: 'saved-input',
    activeTranslationId: 'saved-translation',
  }),
  versions: [],
};
const actors = new Set<ActorRefFrom<typeof appMachine>>();

afterEach(() => {
  actors.forEach((actor) => actor.stop());
  actors.clear();
});

const startActor = (overrides: Parameters<typeof appMachine.provide>[0]['actors'] = {}) => {
  const defaults = {
    initialize: fromPromise<LoadedWorkspace>(() =>
      Promise.resolve({ records: null, workspaces: [] }),
    ),
    render: fromPromise<GraphRenderResult, AppContext>(() => Promise.resolve(rendered)),
  };
  const provided = Object.assign({}, defaults, overrides);
  const actor = createActor(appMachine.provide({ actors: provided }));
  actors.add(actor);
  actor.start();
  return actor;
};

const waitUntilReady = (actor: ActorRefFrom<typeof appMachine>) =>
  vi.waitFor(() =>
    expect(actor.getSnapshot().matches({ document: { active: 'ready' } })).toBe(true),
  );

it.each(Object.values(GRAPH_SAMPLES))(
  'creates a fresh $label sample without changing saved workspaces',
  async (sample) => {
    const render = fromPromise<GraphRenderResult, AppContext>(({ input }) =>
      Promise.resolve({
        diagramType: input.translation.diagramType || 'sequence',
        elements: rendered.elements,
      }),
    );
    const actor = startActor({ render });
    await waitUntilReady(actor);
    const previous = actor.getSnapshot().context.workspace.id;
    actor.send({ type: 'workspace.create', sample: sample.diagramType });
    await waitUntilReady(actor);
    const context = actor.getSnapshot().context;
    expect(context.input.source).toBe(sample.source);
    expect(context.translation.diagramType).toBe(sample.diagramType);
    expect(context.workspace.id).not.toBe(previous);
    expect(context.versions).toEqual([]);
    expect(context.workspaces).toEqual([]);
  },
);

it('defaults omitted sample selection to sequence', async () => {
  const actor = startActor();
  await waitUntilReady(actor);
  actor.send({ type: 'workspace.create' });
  expect(actor.getSnapshot().context.input.source).toBe(GRAPH_SAMPLES.sequence.source);
});

it('preserves sample selection queued during a saved title rename', async () => {
  const pending = Promise.withResolvers<GraphWorkspace>();
  const actor = startActor({
    initialize: fromPromise<LoadedWorkspace>(() =>
      Promise.resolve({ records, workspaces: [records.workspace] }),
    ),
    rename: fromPromise(() => pending.promise),
  });
  await waitUntilReady(actor);
  actor.send({ type: 'title.edit' });
  actor.send({ type: 'workspace.rename', name: 'Renamed' });
  actor.send({ type: 'title.confirm' });
  expect(actor.getSnapshot().matches({ title: 'saving' })).toBe(true);
  actor.send({ type: 'workspace.create', sample: 'stateDiagram' });
  pending.resolve(Object.assign({}, records.workspace, { name: 'Renamed' }));
  await vi.waitFor(() =>
    expect(actor.getSnapshot().context.input.source).toBe(GRAPH_SAMPLES.stateDiagram.source),
  );
  expect(actor.getSnapshot().context.workspace.id).not.toBe('saved');
  expect(actor.getSnapshot().context.workspaces[0].name).toBe('Renamed');
});

it('keeps edits made during saving and renders the newer draft after saving completes', async () => {
  const pending = Promise.withResolvers<SavedWorkspace>();
  const save = vi.fn<(args: { input: AppContext }) => Promise<SavedWorkspace>>();
  save.mockReturnValue(pending.promise);
  const actor = startActor({ save: fromPromise<SavedWorkspace, AppContext>(save) });
  await waitUntilReady(actor);
  actor.send({ type: 'workspace.save' });
  await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
  actor.send({ type: 'input.update', source: 'flowchart LR; New --> Draft' });
  const { input: draft } = save.mock.calls[0][0];
  pending.resolve({ records, draft });
  await waitUntilReady(actor);
  const { context } = actor.getSnapshot();
  expect(context.input.source).toBe('flowchart LR; New --> Draft');
  expect(context.input.id).toBe('saved-input');
  expect(context.input.version).toBe(1);
  expect(context.needsRender).toBe(false);
  expect(actor.getSnapshot().hasTag('saved')).toBe(false);
});

it('recovers a changed draft after a save failure', async () => {
  const pending = Promise.withResolvers<SavedWorkspace>();
  const actor = startActor({
    save: fromPromise<SavedWorkspace, AppContext>(() => pending.promise),
  });
  await waitUntilReady(actor);
  actor.send({ type: 'workspace.save' });
  actor.send({ type: 'input.update', source: 'flowchart TB; Retry --> Draft' });
  pending.reject(new Error('save failed'));
  await waitUntilReady(actor);
  expect(actor.getSnapshot().context.input.source).toBe('flowchart TB; Retry --> Draft');
  expect(actor.getSnapshot().context.operationError).toBe('save failed');
  expect(actor.getSnapshot().context.needsRender).toBe(false);
});

it('renders the initial draft and reports initialization failures', async () => {
  const initialize = fromPromise<LoadedWorkspace>(() => Promise.reject(new Error('read failed')));
  const actor = startActor({ initialize });
  await waitUntilReady(actor);
  expect(actor.getSnapshot().context.operationError).toBe('read failed');
  expect(actor.getSnapshot().context.translation.elements.nodes).toHaveLength(1);
});

it('keeps render errors inline until their details are requested', async () => {
  const render = fromPromise<GraphRenderResult, AppContext>(() =>
    Promise.reject(new Error('bad source')),
  );
  const actor = startActor({ render });
  await waitUntilReady(actor);
  const { context } = actor.getSnapshot();
  expect(context.translation.error).toBe('bad source');
  expect(context.needsRender).toBe(false);
  expect(context.resetLayout).toBe(false);
  expect(context.errorDialogDismissed).toBe(true);
  actor.send({ type: 'error.view' });
  expect(actor.getSnapshot().context.errorDialogDismissed).toBe(false);
  actor.send({ type: 'error.dismiss' });
  expect(actor.getSnapshot().context.errorDialogDismissed).toBe(true);
  expect(actor.getSnapshot().context.translation.error).toBe('bad source');
});

it('reports export failures and returns the export branch to idle', async () => {
  const exportActor = fromPromise<GraphExportResult, AppContext>(() =>
    Promise.reject(new Error('export failed')),
  );
  const actor = startActor({ export: exportActor });
  await waitUntilReady(actor);
  actor.send({ type: 'export.start', request: { format: 'svg', repeat: 'forever' } });
  await vi.waitFor(() => expect(actor.getSnapshot().context.exportError).toBe('export failed'));
  expect(actor.getSnapshot().matches({ exporting: 'idle' })).toBe(true);
});
