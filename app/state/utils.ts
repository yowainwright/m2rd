import { and, assign, assertEvent, enqueueActions, fromPromise, not, setup, stateIn } from 'xstate';
import type { Viewport } from 'reactflow';
import { APP_INITIAL_CONTEXT, SAVE_FEEDBACK_MS } from '@/app/constants';
import { EMPTY_GRAPH_NAME_ERROR, LEGACY_UNTITLED_GRAPH_NAME } from '@/app/graph/constants';
import type { AppContext as AppMachineContext, AppEvent, LoadedWorkspace } from '@/app/types';
import type { GraphRecords, GraphRenderResult, GraphWorkspace } from '@/app/graph';
import type { SavedWorkspace } from './types';
import { runOperation } from '@/app/lib/effect';
import {
  acceptRenderedElements,
  acceptSavedWorkspace,
  deleteWorkspace,
  exportWorkspace,
  isCurrentDraft,
  loadInitialWorkspace,
  loadWorkspace,
  logAppEvent,
  renderWorkspace,
  renameWorkspace,
  resetWorkspace,
  restoreWorkspace,
  saveWorkspace,
  toErrorMessage,
  shouldRerenderWorkspace,
  updateCanvas,
  updateEdgeChanges,
  updateNodeChanges,
  updateStyles,
  updateTranslation,
} from '@/app/utils';

export const getActorInput = ({ context }: { context: AppMachineContext }) => context;
export const getActorOutput = <Value>({ event }: { event: { output: Value } }) => event.output;
export const getActorError = ({ event }: { event: { error: unknown } }) => event.error;

const MAX_VIEWPORT_HISTORY = 5;
const isSameViewport = (current: Viewport | undefined, next: Viewport) => {
  if (!current) return false;
  const sameX = current.x === next.x;
  const sameY = current.y === next.y;
  const sameZoom = current.zoom === next.zoom;
  const samePosition = sameX && sameY;
  return samePosition && sameZoom;
};

const actorSetup = setup({
  types: {} as { context: AppMachineContext; events: AppEvent },
  actors: {
    initialize: fromPromise<LoadedWorkspace>(({ signal }) =>
      runOperation(loadInitialWorkspace(), signal),
    ),
    load: fromPromise(({ input, signal }: { input: AppMachineContext; signal: AbortSignal }) =>
      runOperation(loadWorkspace(input.loadRequest), signal),
    ),
    save: fromPromise(({ input, signal }: { input: AppMachineContext; signal: AbortSignal }) =>
      runOperation(saveWorkspace(input), signal).then((records) => ({
        records,
        draft: input,
      })),
    ),
    rename: fromPromise(({ input, signal }: { input: AppMachineContext; signal: AbortSignal }) =>
      runOperation(renameWorkspace(input), signal),
    ),
    delete: fromPromise(({ input, signal }: { input: AppMachineContext; signal: AbortSignal }) =>
      runOperation(deleteWorkspace(input.workspace.id), signal),
    ),
    render: fromPromise(({ input, signal }: { input: AppMachineContext; signal: AbortSignal }) =>
      runOperation(renderWorkspace(input), signal),
    ),
    export: fromPromise(({ input, signal }: { input: AppMachineContext; signal: AbortSignal }) =>
      runOperation(exportWorkspace(input), signal),
    ),
  },
  guards: {
    needsRender: ({ context }) => context.needsRender,
    hasValidGraph: ({ context }) => context.translation.error === null,
    isSavedWorkspace: ({ context }) => context.input.id !== APP_INITIAL_CONTEXT.input.id,
    isNotExporting: not(stateIn({ exporting: 'running' })),
    isNotRenaming: not(stateIn({ title: 'saving' })),
  },
});

const layoutSetup = actorSetup.extend({
  actions: {
    updateLayout: assign(({ event }) => {
      assertEvent(event, 'layout.update');
      return { isDesktop: event.isDesktop };
    }),
    updatePanelCollapse: assign(({ event }) => {
      assertEvent(event, 'layout.panel.update');
      if (event.panel === 'mermaid') return { mermaidPanelCollapsed: event.collapsed };
      return { reactFlowPanelCollapsed: event.collapsed };
    }),
    updateSidebar: assign(({ event }) => {
      assertEvent(event, 'sidebar.update');
      return { sidebarOpen: event.open };
    }),
    updateVersionHistory: assign(({ event }) => {
      assertEvent(event, 'version-history.update');
      return { versionHistoryOpen: event.open };
    }),
    updateToolkit: assign(({ event }) => {
      assertEvent(event, 'toolkit.update');
      return { toolkitOpen: event.open };
    }),
    clearErrors: assign({
      errorDialogDismissed: true,
      operationError: null,
      exportError: null,
    }),
    showError: assign({ errorDialogDismissed: false }),
  },
});

const documentSetup = layoutSetup.extend({
  delays: { savedFeedback: SAVE_FEEDBACK_MS },
  guards: {
    initialWorkspaceNeedsRender: (_, output: LoadedWorkspace) =>
      output.records !== null && shouldRerenderWorkspace(output.records),
    hasInitialWorkspace: (_, output: LoadedWorkspace) => output.records !== null,
    loadedWorkspaceNeedsRender: (_, records: GraphRecords) => shouldRerenderWorkspace(records),
    savedCurrentDraft: ({ context }, output: SavedWorkspace) =>
      isCurrentDraft(context, output.draft),
    canNavigate: and(['isNotExporting', 'isNotRenaming']),
    canDelete: and(['isSavedWorkspace', 'isNotExporting', 'isNotRenaming']),
    canSave: and(['hasValidGraph', 'isNotRenaming']),
    canGoBackViewport: ({ context }) => context.viewportHistory.length > 0,
    canGoForwardViewport: ({ context }) => context.viewportForwardHistory.length > 0,
  },
  actions: {
    restoreInitialWorkspace: assign(({ context }, { records, workspaces }: LoadedWorkspace) => {
      if (!records) return { workspaces, viewportHistory: [], viewportForwardHistory: [] };
      return Object.assign({}, restoreWorkspace(context, records), {
        workspaces,
        viewportHistory: [],
        viewportForwardHistory: [],
      });
    }),
    acceptInitialWorkspaces: assign((_, output: LoadedWorkspace) => ({
      workspaces: output.workspaces,
      viewportHistory: [],
      viewportForwardHistory: [],
    })),
    acceptRenderedElements: assign(({ context }, output: GraphRenderResult) =>
      acceptRenderedElements(context, output),
    ),
    acceptSavedWorkspace: assign(({ context }, output: SavedWorkspace) =>
      acceptSavedWorkspace(context, output.records),
    ),
    restoreWorkspace: assign(({ context }, records: GraphRecords) =>
      Object.assign({}, restoreWorkspace(context, records), {
        viewportHistory: [],
        viewportForwardHistory: [],
      }),
    ),
    acceptDeletedWorkspace: assign(({ context }) => {
      const workspaces = context.workspaces.filter((item) => item.id !== context.workspace.id);
      return Object.assign({}, resetWorkspace(context), {
        workspaces,
        viewportHistory: [],
        viewportForwardHistory: [],
      });
    }),
    reportOperationError: assign((_, error: unknown) => ({
      operationError: toErrorMessage(error),
      errorDialogDismissed: false,
    })),
    reportRenderError: assign(({ context }, cause: unknown) => {
      const error = toErrorMessage(cause);
      const update = updateTranslation(context, { error });
      const errorDialogDismissed = !context.operationError && !context.exportError;
      return Object.assign({}, update, {
        needsRender: false,
        resetLayout: false,
        errorDialogDismissed,
      });
    }),
    updateInput: assign(({ context, event }) => {
      assertEvent(event, 'input.update');
      const updatedAt = new Date().toISOString();
      const input = Object.assign({}, context.input, { source: event.source, updatedAt });
      return { input, needsRender: true };
    }),
    logInputUpdate: ({ event }) => {
      assertEvent(event, 'input.update');
      logAppEvent('input.update', { source: event.source });
    },
    updateNodes: assign(({ context, event }) => {
      assertEvent(event, 'nodes.update');
      return updateNodeChanges(context, event);
    }),
    updateEdges: assign(({ context, event }) => {
      assertEvent(event, 'edges.update');
      return updateEdgeChanges(context, event);
    }),
    updateStyles: assign(({ context, event }) => {
      assertEvent(event, ['nodes.style', 'edges.style']);
      return updateStyles(context, event);
    }),
    updateCanvas: assign(({ context, event }) => {
      assertEvent(event, 'canvas.update');
      return updateCanvas(context, event);
    }),
    updateViewport: assign(({ context, event }) => {
      assertEvent(event, 'viewport.update');
      const currentViewport = context.translation.view.viewport;
      if (isSameViewport(currentViewport, event.viewport)) return {};
      const viewportHistory = currentViewport
        ? context.viewportHistory.concat(currentViewport).slice(-MAX_VIEWPORT_HISTORY)
        : context.viewportHistory;
      const view = Object.assign({}, context.translation.view, { viewport: event.viewport });
      return Object.assign({}, updateTranslation(context, { view }), {
        viewportHistory,
        viewportForwardHistory: [],
      });
    }),
    goBackViewport: assign(({ context, event }) => {
      assertEvent(event, 'viewport.back');
      const viewport = context.viewportHistory.at(-1);
      const currentViewport = context.translation.view.viewport;
      if (!viewport) return {};
      if (!currentViewport) return {};
      const viewportHistory = context.viewportHistory.slice(0, -1);
      const viewportForwardHistory = context.viewportForwardHistory
        .concat(currentViewport)
        .slice(-MAX_VIEWPORT_HISTORY);
      const view = Object.assign({}, context.translation.view, { viewport });
      return Object.assign({}, updateTranslation(context, { view }), {
        viewportHistory,
        viewportForwardHistory,
      });
    }),
    goForwardViewport: assign(({ context, event }) => {
      assertEvent(event, 'viewport.forward');
      const viewport = context.viewportForwardHistory.at(-1);
      const currentViewport = context.translation.view.viewport;
      if (!viewport) return {};
      if (!currentViewport) return {};
      const viewportHistory = context.viewportHistory
        .concat(currentViewport)
        .slice(-MAX_VIEWPORT_HISTORY);
      const viewportForwardHistory = context.viewportForwardHistory.slice(0, -1);
      const view = Object.assign({}, context.translation.view, { viewport });
      return Object.assign({}, updateTranslation(context, { view }), {
        viewportHistory,
        viewportForwardHistory,
      });
    }),
    resetWorkspace: assign(({ context, event }) => {
      assertEvent(event, 'workspace.create');
      return Object.assign({}, resetWorkspace(context, event.sample), {
        viewportHistory: [],
        viewportForwardHistory: [],
      });
    }),
    clearOperationError: assign({ operationError: null }),
    requestWorkspace: assign(({ event }) => {
      assertEvent(event, 'workspace.load');
      return { loadRequest: event.request };
    }),
    requestLayoutReset: assign({
      resetLayout: true,
      needsRender: true,
      viewportHistory: [],
      viewportForwardHistory: [],
    }),
  },
});

const titleSetup = documentSetup.extend({
  guards: {
    isTitleEmpty: ({ context }) => context.titleDraft.trim().length === 0,
    isTitleUnchanged: ({ context }) => context.titleDraft.trim() === context.workspace.name,
    canEditTitle: and([
      stateIn({ document: 'active' }),
      not(stateIn({ document: { active: 'saving' } })),
    ]),
    canDeleteAfterRename: and(['isSavedWorkspace', 'isNotExporting']),
    canSaveAfterRename: and(['hasValidGraph', not('needsRender')]),
  },
  actions: {
    acceptRenamedWorkspace: assign(({ context }, workspace: GraphWorkspace) => {
      const others = context.workspaces.filter((item) => item.id !== workspace.id);
      const workspaces = [workspace].concat(others);
      return { workspace, workspaces, titleError: null };
    }),
    reportTitleError: assign((_, error: unknown) => ({
      titleError: toErrorMessage(error),
      afterRename: null,
    })),
    clearTitleError: assign({ titleError: null }),
    reportEmptyTitle: assign({ titleError: EMPTY_GRAPH_NAME_ERROR }),
    clearAfterRename: assign({ afterRename: null }),
    editTitle: assign(({ context }) => {
      const titleDraft =
        context.workspace.name === LEGACY_UNTITLED_GRAPH_NAME ? '' : context.workspace.name;
      return { titleDraft, titleError: null };
    }),
    updateTitle: assign(({ event }) => {
      assertEvent(event, 'workspace.rename');
      return { titleDraft: event.name, titleError: null };
    }),
    acceptDraftTitle: assign(({ context }) => {
      const updatedAt = new Date().toISOString();
      const name = context.titleDraft.trim();
      const workspace = Object.assign({}, context.workspace, { name, updatedAt });
      return { workspace, titleError: null };
    }),
    queueAfterRename: assign(({ event }) => {
      assertEvent(event, [
        'workspace.create',
        'workspace.save',
        'workspace.load',
        'workspace.delete',
      ]);
      return { afterRename: event };
    }),
    resumeAfterRename: enqueueActions(({ context, enqueue }) => {
      if (context.afterRename) enqueue.raise(context.afterRename);
      enqueue.assign({ afterRename: null });
    }),
  },
});

export const appSetup = titleSetup.extend({
  guards: {
    canStartExport: and([stateIn({ document: 'active' }), 'canExport']),
    canExport: ({ context }) => {
      const hasNodes = context.translation.elements.nodes.length > 0;
      const hasError = context.translation.error !== null;
      const canExport = hasNodes && !hasError && !context.needsRender;
      return canExport;
    },
  },
  actions: {
    reportExportError: assign((_, error: unknown) => ({
      exportError: toErrorMessage(error),
      errorDialogDismissed: false,
    })),
    requestExport: assign(({ event }) => {
      assertEvent(event, 'export.start');
      return { exportRequest: event.request, exportError: null };
    }),
  },
});
