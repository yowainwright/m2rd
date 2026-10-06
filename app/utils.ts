import { Effect, Semaphore } from 'effect';
import mermaid from 'mermaid';
import { renderStateDiagram } from '@/app/graph/state';
import { renderClassDiagram } from '@/app/graph/class';
import { renderErDiagram } from '@/app/graph/er';
import { renderGanttDiagram } from '@/app/graph/gantt';
import { applyEdgeChanges, applyNodeChanges } from 'reactflow';
import {
  applySavedAppearance,
  applySettings,
  getElementIds,
  getSelectedEdges,
  getSelectedNodes,
  getTranslation,
  graphRepository,
  parseMermaidSvg,
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
import {
  DEFAULT_CANVAS_SETTINGS,
  DEFAULT_SETTINGS,
  GRAPH_DIAGRAM_TYPES,
} from '@/app/graph/constants';
import { exportGif, exportPng, exportSvg, getSvgExportElement } from '@/app/export';
import { createBrowserLogger } from '@/app/lib/observability';
import { APP_INITIAL_CONTEXT, GRAPH_SAMPLES } from './constants';
import type { AppContext, AppEvent, LoadedWorkspace, WorkspaceRequest } from './types';

mermaid.initialize({
  securityLevel: 'strict',
  sequence: {
    mirrorActors: true,
    actorFontSize: 16,
    messageFontSize: 16,
    noteFontSize: 14,
    messageMargin: 48,
    boxTextMargin: 10,
  },
  startOnLoad: false,
  themeVariables: { rectBkgColor: 'transparent' },
});
const browserLogger = createBrowserLogger();
const renderSemaphore = Semaphore.makeUnsafe(1);

export const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return 'The operation could not be completed.';
};

export const getSupportedDiagramType = (diagramType: string): GraphDiagramType => {
  const normalizedType = diagramType === 'flowchart-v2' ? 'flowchart' : diagramType;
  const isSupported = GRAPH_DIAGRAM_TYPES.includes(normalizedType as GraphDiagramType);
  if (!isSupported) {
    throw new GraphRenderError(
      'unsupported',
      `Mermaid diagram type "${diagramType}" is not supported in the React Flow view yet.`,
      diagramType,
    );
  }
  return normalizedType as GraphDiagramType;
};

const storageError = (cause: unknown) => {
  return new Error(`Saved graphs: ${toErrorMessage(cause)}`, { cause });
};

export const loadInitialWorkspace = () =>
  Effect.tryPromise({
    try: async (): Promise<LoadedWorkspace> => {
      const workspaces = await graphRepository.list();
      const [workspace] = workspaces;
      const records = workspace ? await graphRepository.read(workspace.id) : null;
      return { records, workspaces };
    },
    catch: storageError,
  });

export const loadWorkspace = (request: WorkspaceRequest | null) =>
  Effect.tryPromise({
    try: async () => {
      if (!request) throw new Error('No graph was selected.');
      const records = await graphRepository.read(request.workspaceId, request.versionId);
      if (!records) throw new Error('This graph version is no longer available.');
      return records;
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

const createDefaultTranslationSettings = (): GraphTranslationSettings =>
  Object.assign({}, DEFAULT_SETTINGS, {
    nodeGradient: Object.assign({}, DEFAULT_SETTINGS.nodeGradient),
  });

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

export const renderWorkspace = (context: AppContext) =>
  Effect.tryPromise({
    try: async () => {
      const id = `m2rd-${crypto.randomUUID()}`;
      const parsed = await mermaid.parse(context.input.source);
      const detectedType = getSupportedDiagramType(parsed.diagramType);
      const nativeRenderer = {
        stateDiagram: renderStateDiagram,
        classDiagram: renderClassDiagram,
        er: renderErDiagram,
        gantt: renderGanttDiagram,
      };
      const isNative = detectedType !== 'flowchart' && detectedType !== 'sequence';
      if (isNative) {
        const elements = await nativeRenderer[detectedType](
          id,
          context.input.source,
          context.translation.settings,
        );
        return { diagramType: detectedType, elements } satisfies GraphRenderResult;
      }
      const result = await mermaid.render(id, context.input.source);
      const diagramType = getSupportedDiagramType(result.diagramType);
      const elements = parseMermaidSvg(result.svg, context.translation.settings, diagramType);
      return { diagramType, elements } satisfies GraphRenderResult;
    },
    catch: (cause) => {
      if (cause instanceof GraphRenderError) return cause;
      return new GraphRenderError('invalid', `Mermaid: ${toErrorMessage(cause)}`);
    },
  }).pipe(Effect.uninterruptible, renderSemaphore.withPermits(1));

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

export const rememberWorkspace = (workspaces: GraphWorkspace[], workspace: GraphWorkspace) => {
  const otherWorkspaces = workspaces.filter((item) => item.id !== workspace.id);
  return [workspace].concat(otherWorkspaces);
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

export const isCurrentDraft = (context: AppContext, draft: AppContext) => {
  const sameName = context.workspace.name === draft.workspace.name;
  const sameSource = context.input.source === draft.input.source;
  const sameTranslation = context.translation === draft.translation;
  const unchanged = sameName && sameSource && sameTranslation;
  return unchanged;
};

export const updateTranslation = (context: AppContext, update: Partial<GraphTranslation>) => {
  const updatedAt = new Date().toISOString();
  const translation = Object.assign({}, context.translation, update, { updatedAt });
  return { translation };
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
