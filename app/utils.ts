import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { createAuthClient } from 'better-auth/client';
import { captureSvg } from '@/app/export';
import {
  decodeSnapshot,
  encodeSnapshot,
  formatSnapshotLink,
  parseSnapshotLink,
} from '@/app/graph/snapshot';
import {
  completeRemoteDraft,
  remoteDrafts,
  readRemoteSnapshot,
  rememberRemoteSnapshot,
} from '@/app/graph/repository';
import type { AccountSnapshotPage, RemoteDraft, SharedSnapshot } from '@/app/types';
import { initializeBrowserRenderer, renderGraph } from '@/app/graph/render';
import { Effect, Semaphore } from 'effect';
import { applyEdgeChanges, applyNodeChanges } from 'reactflow';
import {
  applySavedAppearance,
  applySettings,
  getElementIds,
  getSelectedEdges,
  getSelectedNodes,
  getTranslation,
  graphRepository,
  updateSelectedEdges,
  updateSelectedNodes,
} from '@/app/graph';
import { GraphRenderError } from '@/app/graph';
import type {
  GraphCanvasSettings,
  GraphDiagramType,
  GraphRecords,
  GraphRenderResult,
  GraphTranslation,
  GraphTranslationSettings,
  GraphWorkspace,
} from '@/app/graph';
import { DEFAULT_CANVAS_SETTINGS, DEFAULT_SETTINGS } from '@/app/graph/constants';
import { exportGif, exportPng, exportSvg, getSvgExportElement } from '@/app/export';
import { createBrowserLogger } from '@/app/lib/observability';
import { APP_INITIAL_CONTEXT, GRAPH_SAMPLES } from './constants';
import type { AppContext, AppEvent, LoadedWorkspace, WorkspaceRequest } from './types';

initializeBrowserRenderer();

const browserLogger = createBrowserLogger();

const renderSemaphore = Semaphore.makeUnsafe(1);

const apiOrigin = process.env.NEXT_PUBLIC_M2RD_API_ORIGIN ?? 'https://m2rd-api.jeffry.in';

export const authClient = createAuthClient({
  baseURL: apiOrigin,
  plugins: [oauthProviderClient()],
  fetchOptions: { credentials: 'include' },
});

export const loadInitialWorkspace = () =>
  Effect.tryPromise({
    try: async (): Promise<LoadedWorkspace> => {
      const workspaces = await graphRepository.list();
      const [workspace] = workspaces;
      const records = workspace ? await graphRepository.read(workspace.id) : null;
      return loadBrowserWorkspace(records, workspaces);
    },
    catch: storageError,
  });

export const prepareRemoteDraft = (context: AppContext) =>
  Effect.gen(function* () {
    const element = getSvgExportElement();
    if (!element) return yield* Effect.fail(new Error('There is no graph to save.'));
    const svg = yield* Effect.tryPromise(() => captureSvg(element));
    const records = yield* saveWorkspace(context);
    const saveId = crypto.randomUUID();
    const previous =
      context.remote ?? (yield* Effect.tryPromise(() => readRemoteSnapshot(records.workspace.id)));
    const target = previous ? { gistId: previous.gistId, revision: previous.revision } : undefined;
    const snapshot = yield* encodeSnapshot({
      records,
      svg,
      saveId,
      ordinal: 1,
      forkedFrom: previous?.forkedFrom,
    });
    const draft = { workspaceId: records.workspace.id, saveId, snapshot, target };
    return { records, draft, captured: context };
  });

export const submitRemoteDraft = async (draft: RemoteDraft, signal: AbortSignal) => {
  await remoteDrafts.put({ ...draft, reconcileOnly: true });
  const payload = JSON.stringify({
    snapshot: draft.snapshot,
    target: draft.target,
    forkId: draft.forkId,
    reconcileOnly: draft.reconcileOnly,
  });
  const response = await fetch(`${apiOrigin}/api/snapshots`, {
    method: 'POST',
    credentials: 'include',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
  if (response.status === 401) {
    await remoteDrafts.put(draft);
    return null;
  }
  const data = await response.json();
  if (response.ok) return acceptRemoteResult(data, draft);
  const forkId = typeof data.forkId === 'string' ? data.forkId : draft.forkId;
  const reconcileOnly = Boolean(draft.reconcileOnly || data.outcomeUnknown);
  await remoteDrafts.put({ ...draft, forkId, reconcileOnly });
  const message =
    typeof data.error === 'string' ? data.error : 'The remote save could not be completed.';
  throw new Error(message);
};

export const loadRemoteDraft = async (draft: RemoteDraft) =>
  (await remoteDrafts.get(draft.saveId)) ?? draft;

export const discardRemoteDraft = (draft: RemoteDraft | null) =>
  Effect.tryPromise({
    try: async () => {
      if (!draft) throw new Error('There is no pending save to discard.');
      await remoteDrafts.delete(draft.saveId);
    },
    catch: storageError,
  });

export const openWorkspaceSignIn = (context: AppContext, resumeSave: boolean) =>
  Effect.gen(function* () {
    const draft = context.remoteDraft;
    const missingDraft = resumeSave && !draft;
    if (missingDraft) return yield* Effect.fail(new Error('There is no remote save to continue.'));
    let current = context;
    if (context.needsRender) {
      const rendered = yield* renderWorkspace(context);
      current = Object.assign({}, context, acceptRenderedElements(context, rendered));
    }
    yield* saveWorkspace(current);
    const path = resumeSave && draft ? `/m2rd/?save=${draft.saveId}` : '/m2rd/';
    window.location.assign(`/m2rd/sign-in/?returnTo=${encodeURIComponent(path)}`);
  });

export const copyRemoteLink = async (snapshot: SharedSnapshot) => {
  const session = await authClient.getSession();
  if (!session.data?.user) {
    const returnTo = encodeURIComponent(window.location.pathname);
    window.location.assign(`/m2rd/sign-in/?returnTo=${returnTo}`);
    return;
  }
  await navigator.clipboard.writeText(snapshot.url);
};

export const readRemoteAccount = async () => {
  const result = await authClient.getSession();
  return result.data?.user.id ?? null;
};

export const listRemoteSnapshots = async (
  requestedPage: number,
  expectedAccount: string | null,
  signal: AbortSignal,
): Promise<AccountSnapshotPage> => {
  const url = new URL('/api/snapshots', apiOrigin);
  const continuation = requestedPage > 1 && expectedAccount;
  if (continuation) {
    url.searchParams.set('page', String(requestedPage));
    url.searchParams.set('account', expectedAccount);
  }
  const response = await fetch(url, { credentials: 'include', signal });
  if (response.status === 401) return { accountId: null, snapshots: [], page: 1, nextPage: null };
  if (!response.ok) throw new Error('Saved graphs are unavailable.');
  const accountId = response.headers.get('M2rd-Account-Id');
  if (!accountId) throw new Error('Could not identify the account for these saved graphs.');
  const page = expectedAccount === accountId ? requestedPage : 1;
  const snapshots = await response.json();
  const nextPage = response.headers.has('Link') ? page + 1 : null;
  return { accountId, snapshots, page, nextPage };
};

export const loadWorkspace = (request: WorkspaceRequest | null) =>
  Effect.tryPromise({
    try: async () => {
      if (!request) throw new Error('No graph was selected.');
      const records = await graphRepository.read(request.workspaceId, request.versionId);
      if (!records) throw new Error('This graph version is no longer available.');
      return readStoredWorkspace(records);
    },
    catch: storageError,
  });

export const saveWorkspace = (context: AppContext) =>
  Effect.tryPromise({
    try: () => {
      const { diagramType, elements, error, settings, view } = context.translation;
      const translation = { diagramType, elements, error, settings, view };
      const input = { format: context.input.format, source: context.input.source };
      const isInitialDraft = context.workspace.id === APP_INITIAL_CONTEXT.workspace.id;
      const workspaceId = isInitialDraft ? undefined : context.workspace.id;
      const workspace = { id: workspaceId, name: context.workspace.name };
      const isNew = context.input.id === APP_INITIAL_CONTEXT.input.id;
      if (isNew) return graphRepository.create({ input, translation, workspace });
      const savedWorkspace = Object.assign({}, workspace, { id: context.workspace.id });
      return graphRepository.update({ input, translation, workspace: savedWorkspace });
    },
    catch: storageError,
  });

export const deleteWorkspace = (id: string) =>
  Effect.tryPromise({
    try: () => graphRepository.delete(id),
    catch: storageError,
  });

export const renameWorkspace = (context: AppContext) =>
  Effect.tryPromise({
    try: () => graphRepository.rename(context.workspace.id, context.titleDraft),
    catch: storageError,
  });

export const renderWorkspace = (context: AppContext) =>
  Effect.tryPromise({
    try: () => renderGraph(context.input.source, context.translation.settings),
    catch: (cause) => {
      if (cause instanceof GraphRenderError) return cause;
      return new GraphRenderError('invalid', `Mermaid: ${toErrorMessage(cause)}`);
    },
  }).pipe(Effect.uninterruptible, renderSemaphore.withPermits(1));

export const exportWorkspace = (context: AppContext) =>
  Effect.tryPromise({
    try: async () => {
      const element = getSvgExportElement();
      if (!element) throw new Error('There is no graph to export.');
      const name = context.workspace.name;
      const { format, repeat } = context.exportRequest;
      if (format === 'gif') return await exportGif({ element, name, repeat });
      if (format === 'png') return await exportPng({ element, name });
      return await exportSvg({ element, name });
    },
    catch: (cause) => new Error(`Export: ${toErrorMessage(cause)}`, { cause }),
  });

export const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return 'The operation could not be completed.';
};

export const resetWorkspace = (context: AppContext, sample: GraphDiagramType = 'sequence') => {
  const workspaceId = crypto.randomUUID();
  const { source, diagramType } = GRAPH_SAMPLES[sample];
  const input = Object.assign({}, APP_INITIAL_CONTEXT.input, { workspaceId, source });
  const workspace = Object.assign({}, APP_INITIAL_CONTEXT.workspace, { id: workspaceId });
  const translation = Object.assign({}, APP_INITIAL_CONTEXT.translation, {
    diagramType,
    elements: { nodes: [], edges: [] },
    error: null,
    settings: createDefaultTranslationSettings(),
    view: { canvas: createDefaultCanvasSettings() },
  });
  return {
    input,
    translation,
    workspace,
    versions: [],
    canvasRevision: context.canvasRevision + 1,
    needsRender: true,
    resetLayout: false,
    errorDialogDismissed: false,
    operationError: null,
    exportError: null,
    loadRequest: null,
    remote: null,
    remoteDraft: null,
    remoteError: null,
  };
};

export const restoreWorkspace = (context: AppContext, records: GraphRecords) => {
  const translation = getTranslation(records.translation);
  const canvasRevision = context.canvasRevision + 1;
  const needsRender = shouldRerenderWorkspace(records);
  return Object.assign({}, records, {
    translation,
    canvasRevision,
    needsRender,
    resetLayout: needsRender,
    loadRequest: null,
    operationError: null,
    exportError: null,
    errorDialogDismissed: false,
  });
};

export const shouldRerenderWorkspace = (records: GraphRecords) => {
  const translation = records.translation;
  const isSequence = translation.diagramType === 'sequence';
  if (!isSequence) return false;
  const participantNodes = translation.elements.nodes.filter(
    (node) => node.data?.kind === 'sequence-participant',
  );
  const hasLegacyParticipants = participantNodes.some(
    (node) => !Array.isArray(node.data?.handles) || node.data.styleVersion !== 1,
  );
  const hasMessageEdges = translation.elements.edges.some(
    (edge) => edge.data?.kind === 'sequence-message',
  );
  const hasActionNodes = translation.elements.nodes.some(
    (node) => node.data?.kind === 'sequence-action',
  );
  const hasLegacyMessages = hasMessageEdges && !hasActionNodes;
  const needsUpgrade = hasLegacyParticipants || hasLegacyMessages;
  return needsUpgrade;
};

export const acceptSavedWorkspace = (context: AppContext, records: GraphRecords) => {
  const { id, version, workspaceId } = records.input;
  const input = Object.assign({}, context.input, { id, version, workspaceId });
  const translation = Object.assign({}, context.translation, {
    id: records.translation.id,
    inputId: id,
  });
  const workspace = Object.assign({}, records.workspace, { name: context.workspace.name });
  const workspaces = rememberWorkspace(context.workspaces, records.workspace);
  return { input, translation, workspace, workspaces, versions: records.versions };
};

export const rememberWorkspace = (workspaces: GraphWorkspace[], workspace: GraphWorkspace) => {
  const otherWorkspaces = workspaces.filter((item) => item.id !== workspace.id);
  return [workspace].concat(otherWorkspaces);
};

export const isCurrentDraft = (context: AppContext, draft: AppContext) => {
  const sameName = context.workspace.name === draft.workspace.name;
  const sameSource = context.input.source === draft.input.source;
  const sameTranslation = context.translation === draft.translation;
  const unchanged = sameName && sameSource && sameTranslation;
  return unchanged;
};

export const acceptRenderedElements = (context: AppContext, rendered: GraphRenderResult) => {
  const { diagramType, elements: renderedElements } = rendered;
  const hasSourceAppearance = ['sequence', 'classDiagram', 'er', 'gantt'].includes(diagramType);
  const styleTargets = hasSourceAppearance
    ? { nodes: [], edges: renderedElements.edges }
    : renderedElements;
  const styled = applySettings(styleTargets, context.translation.settings);
  const defaults = Object.assign({}, styled, {
    nodes: hasSourceAppearance ? renderedElements.nodes : styled.nodes,
  });
  const elements = applySavedAppearance(
    defaults,
    diagramType === context.translation.diagramType
      ? context.translation.elements
      : { nodes: [], edges: [] },
    context.resetLayout,
  );
  const update = updateTranslation(context, { diagramType, elements, error: null });
  return Object.assign({}, update, { needsRender: false, resetLayout: false });
};

export const updateNodeChanges = (
  context: AppContext,
  event: Extract<AppEvent, { type: 'nodes.update' }>,
) => {
  const current = context.translation.elements.nodes;
  const isGantt = context.translation.diagramType === 'gantt';
  const taskIds = new Set(
    current.filter((node) => node.data?.kind === 'gantt-task').map((node) => node.id),
  );
  const changes = isGantt
    ? event.changes.filter((change) => {
        if (change.type === 'dimensions') return true;
        const selectTask = change.type === 'select' && taskIds.has(change.id);
        return selectTask;
      })
    : event.changes;
  const nodes = applyNodeChanges(changes, current);
  const remainingIds = new Set(getElementIds(nodes));
  const edges = context.translation.elements.edges.filter(
    (edge) => remainingIds.has(edge.source) && remainingIds.has(edge.target),
  );
  return updateTranslation(context, { elements: { nodes, edges } });
};

export const updateEdgeChanges = (
  context: AppContext,
  event: Extract<AppEvent, { type: 'edges.update' }>,
) => {
  if (context.translation.diagramType === 'gantt') {
    return updateTranslation(context, { elements: context.translation.elements });
  }
  const edges = applyEdgeChanges(event.changes, context.translation.elements.edges);
  const elements = Object.assign({}, context.translation.elements, { edges });
  return updateTranslation(context, { elements });
};

export const updateStyles = (
  context: AppContext,
  event: Extract<AppEvent, { type: 'nodes.style' | 'edges.style' }>,
) => {
  const current = context.translation.elements;
  const isNodeStyle = event.type === 'nodes.style';
  const selected = isNodeStyle ? getSelectedNodes(current.nodes) : getSelectedEdges(current.edges);
  const ids = getElementIds(selected);
  if (ids.length === 0) {
    const elements = applySettings(current, event.settings);
    const settings = Object.assign({}, context.translation.settings, event.settings);
    return updateTranslation(context, { elements, settings });
  }
  const elements = isNodeStyle
    ? updateSelectedNodes(current, ids, event.settings)
    : updateSelectedEdges(current, ids, event.settings);
  return updateTranslation(context, { elements });
};

export const updateCanvas = (
  context: AppContext,
  event: Extract<AppEvent, { type: 'canvas.update' }>,
) => {
  const canvas = Object.assign(
    {},
    DEFAULT_CANVAS_SETTINGS,
    context.translation.view.canvas,
    event.settings,
  );
  const view = Object.assign({}, context.translation.view, { canvas });
  return updateTranslation(context, { view });
};

export const updateTranslation = (context: AppContext, update: Partial<GraphTranslation>) => {
  const updatedAt = new Date().toISOString();
  const translation = Object.assign({}, context.translation, update, { updatedAt });
  return { translation };
};

export const handleReactFlowError = (code: string, message: string) => {
  if (code === '002') return;
  browserLogger.warn({ code, message }, 'react flow error');
};

export const logAppEvent = (name: string, payload: Record<string, unknown> = {}) => {
  const eventPayload = Object.assign({}, payload, { event: name });
  browserLogger.debug(eventPayload, 'm2rd app event');
};

export const getSelectionLabel = (nodeCount: number, edgeCount: number) => {
  const hasNodes = nodeCount > 0;
  const hasEdges = edgeCount > 0;
  const hasBoth = hasNodes && hasEdges;
  const nodeLabel = nodeCount === 1 ? '1 node' : `${nodeCount} nodes`;
  const edgeLabel = edgeCount === 1 ? '1 edge' : `${edgeCount} edges`;
  if (hasBoth) return `${nodeLabel}, ${edgeLabel}`;
  if (hasNodes) return nodeLabel;
  if (hasEdges) return edgeLabel;
  return 'Global';
};

export const getSaveLabel = (snapshot: { hasTag: (tag: string) => boolean }) => {
  if (snapshot.hasTag('saving')) return 'Saving';
  if (snapshot.hasTag('saved')) return 'Saved';
  return 'Save';
};

const loadBrowserWorkspace = async (
  records: GraphRecords | null,
  workspaces: GraphWorkspace[],
): Promise<LoadedWorkspace> => {
  const params = new URLSearchParams(window.location.search);
  const pendingId = params.get('save');
  const pending = pendingId ? await remoteDrafts.get(pendingId) : undefined;
  if (pending) {
    const saved = await graphRepository.read(pending.workspaceId);
    const resumePending = !params.has('cancel') && !params.has('error');
    if (saved) {
      const stored = await readStoredWorkspace(saved);
      return { ...stored, workspaces, pending, resumePending };
    }
  }
  const frozen = parseSnapshotLink(window.location.pathname);
  if (frozen) {
    try {
      return await openSnapshot(frozen, workspaces);
    } catch (cause) {
      return { records, workspaces, sharedError: toErrorMessage(cause) };
    }
  }
  if (!records) return { records, workspaces };
  const stored = await readStoredWorkspace(records);
  return { ...stored, workspaces };
};

const readStoredWorkspace = async (records: GraphRecords) => {
  const { id } = records.workspace;
  const shared = await readRemoteSnapshot(id);
  const pending = await remoteDrafts.where('workspaceId').equals(id).first();
  return { records, shared, pending };
};

const openSnapshot = async (
  link: NonNullable<ReturnType<typeof parseSnapshotLink>>,
  workspaces: GraphWorkspace[],
) => {
  const { gistId, revision } = link;
  const response = await fetch(`${apiOrigin}/api/snapshots/${gistId}/${revision}`);
  if (!response.ok) throw new Error('This saved graph is unavailable.');
  const payload = await response.json();
  const snapshot = await Effect.runPromise(decodeSnapshot(JSON.stringify(payload.snapshot)));
  const { workspace, input, translation } = snapshot.records;
  const records = await graphRepository.create({
    workspace: { name: workspace.name },
    input,
    translation,
  });
  const url = formatSnapshotLink(link);
  const shared = {
    ...link,
    fileName: payload.fileName,
    url,
    svg: snapshot.svg.text,
    forkedFrom: snapshot.forkedFrom,
  };
  await rememberRemoteSnapshot(records.workspace.id, shared);
  window.history.replaceState(null, '', '/m2rd/');
  return { records, workspaces: rememberWorkspace(workspaces, records.workspace), shared };
};

const acceptRemoteResult = async (saved: SharedSnapshot, draft: RemoteDraft) => {
  const snapshot = await Effect.runPromise(decodeSnapshot(draft.snapshot));
  const shared = {
    ...saved,
    svg: snapshot.svg.text,
    forkedFrom: saved.forkedFrom ?? snapshot.forkedFrom,
  };
  await completeRemoteDraft(draft, shared);
  window.history.replaceState(null, '', window.location.pathname);
  return shared;
};

const storageError = (cause: unknown) => {
  return new Error(`Saved graphs: ${toErrorMessage(cause)}`, { cause });
};

const createDefaultCanvasSettings = (): GraphCanvasSettings =>
  Object.assign({}, DEFAULT_CANVAS_SETTINGS, {
    background: 'none' as const,
    gradient: Object.assign({}, DEFAULT_CANVAS_SETTINGS.gradient),
    pattern: Object.assign({}, DEFAULT_CANVAS_SETTINGS.pattern),
    shader: Object.assign({}, DEFAULT_CANVAS_SETTINGS.shader, {
      aurora: Object.assign({}, DEFAULT_CANVAS_SETTINGS.shader.aurora),
      gradientMesh: Object.assign({}, DEFAULT_CANVAS_SETTINGS.shader.gradientMesh),
    }),
  });

const createDefaultTranslationSettings = (): GraphTranslationSettings =>
  Object.assign({}, DEFAULT_SETTINGS, {
    nodeGradient: Object.assign({}, DEFAULT_SETTINGS.nodeGradient),
  });
