import { APP_INITIAL_CONTEXT } from '@/app/constants';
import { appSetup, getActorError, getActorInput, getActorOutput } from './utils';

const TITLE = appSetup.createStateConfig({
  initial: 'idle',
  states: {
    idle: {
      on: {
        'title.edit': { guard: 'canEditTitle', target: 'editing', actions: 'editTitle' },
      },
    },
    editing: {
      on: {
        'workspace.rename': { actions: 'updateTitle' },
        'title.cancel': { target: 'idle', actions: 'clearTitleError' },
        'workspace.create': 'idle',
        'workspace.load': 'idle',
        'workspace.delete': 'idle',
        'workspace.save': 'idle',
        'title.confirm': [
          { guard: 'isTitleEmpty', actions: 'reportEmptyTitle' },
          { guard: 'isTitleUnchanged', target: 'idle' },
          { guard: 'isSavedWorkspace', target: 'saving' },
          { target: 'idle', actions: 'acceptDraftTitle' },
        ],
      },
    },
    saving: {
      tags: ['storageBusy'],
      entry: 'clearAfterRename',
      on: {
        'workspace.create': { guard: 'isNotExporting', actions: 'queueAfterRename' },
        'workspace.load': { guard: 'isNotExporting', actions: 'queueAfterRename' },
        'workspace.delete': { guard: 'canDeleteAfterRename', actions: 'queueAfterRename' },
        'workspace.save': { guard: 'canSaveAfterRename', actions: 'queueAfterRename' },
      },
      invoke: {
        src: 'rename',
        input: getActorInput,
        onDone: {
          target: 'idle',
          actions: [
            { type: 'acceptRenamedWorkspace', params: getActorOutput },
            'resumeAfterRename',
          ],
        },
        onError: {
          target: 'editing',
          actions: { type: 'reportTitleError', params: getActorError },
        },
      },
    },
  },
});

const EXPORTING = appSetup.createStateConfig({
  initial: 'idle',
  states: {
    idle: {
      on: {
        'export.start': { guard: 'canStartExport', target: 'running', actions: 'requestExport' },
      },
    },
    running: {
      tags: ['exporting'],
      invoke: {
        src: 'export',
        input: getActorInput,
        onDone: 'idle',
        onError: {
          target: 'idle',
          actions: { type: 'reportExportError', params: getActorError },
        },
      },
    },
  },
});

const ACTIVE_DOCUMENT = appSetup.createStateConfig({
  initial: 'ready',
  on: {
    'nodes.update': { actions: 'updateNodes' },
    'edges.update': { actions: 'updateEdges' },
    'nodes.style': { actions: 'updateStyles' },
    'edges.style': { actions: 'updateStyles' },
    'canvas.update': { actions: 'updateCanvas' },
    'viewport.update': { actions: 'updateViewport' },
    'viewport.back': { guard: 'canGoBackViewport', actions: 'goBackViewport' },
    'viewport.forward': { guard: 'canGoForwardViewport', actions: 'goForwardViewport' },
    'input.update': {
      target: '.rendering',
      reenter: true,
      actions: ['logInputUpdate', 'updateInput'],
    },
    'layout.reset': { target: '.rendering', reenter: true, actions: 'requestLayoutReset' },
    'workspace.create': { guard: 'canNavigate', target: '.rendering', actions: 'resetWorkspace' },
    'workspace.load': {
      guard: 'canNavigate',
      target: '#workspace-loading',
      actions: 'requestWorkspace',
    },
    'workspace.delete': { guard: 'canDelete', target: '#workspace-deleting' },
    'workspace.save': { guard: 'canSave', target: '.saving' },
  },
  states: {
    ready: {},
    rendering: {
      tags: ['rendering'],
      on: { 'workspace.save': {} },
      invoke: {
        src: 'render',
        input: getActorInput,
        onDone: {
          target: 'ready',
          actions: { type: 'acceptRenderedElements', params: getActorOutput },
        },
        onError: {
          target: 'ready',
          actions: { type: 'reportRenderError', params: getActorError },
        },
      },
    },
    saving: {
      tags: ['saving', 'storageBusy'],
      entry: 'clearOperationError',
      on: {
        'input.update': { actions: ['logInputUpdate', 'updateInput'] },
        'workspace.create': {},
        'workspace.load': {},
        'workspace.delete': {},
        'workspace.save': {},
        'layout.reset': {},
      },
      invoke: {
        src: 'save',
        input: getActorInput,
        onDone: [
          {
            guard: { type: 'savedCurrentDraft', params: getActorOutput },
            target: 'saved',
            actions: { type: 'acceptSavedWorkspace', params: getActorOutput },
          },
          {
            target: 'recover',
            actions: { type: 'acceptSavedWorkspace', params: getActorOutput },
          },
        ],
        onError: [
          {
            guard: 'needsRender',
            target: 'rendering',
            actions: { type: 'reportOperationError', params: getActorError },
          },
          {
            target: 'ready',
            actions: { type: 'reportOperationError', params: getActorError },
          },
        ],
      },
    },
    saved: { tags: ['saved'], after: { savedFeedback: 'ready' } },
    recover: { always: [{ guard: 'needsRender', target: 'rendering' }, { target: 'ready' }] },
  },
});

const DOCUMENT = appSetup.createStateConfig({
  initial: 'booting',
  states: {
    booting: {
      tags: ['reading', 'storageBusy'],
      invoke: {
        src: 'initialize',
        onDone: [
          {
            guard: { type: 'initialWorkspaceNeedsRender', params: getActorOutput },
            target: 'active.rendering',
            actions: { type: 'restoreInitialWorkspace', params: getActorOutput },
          },
          {
            guard: { type: 'hasInitialWorkspace', params: getActorOutput },
            target: 'active.ready',
            actions: { type: 'restoreInitialWorkspace', params: getActorOutput },
          },
          {
            target: 'active.rendering',
            actions: { type: 'acceptInitialWorkspaces', params: getActorOutput },
          },
        ],
        onError: {
          target: 'active.rendering',
          actions: { type: 'reportOperationError', params: getActorError },
        },
      },
    },
    active: ACTIVE_DOCUMENT,
    loading: {
      id: 'workspace-loading',
      tags: ['reading', 'storageBusy'],
      entry: 'clearOperationError',
      invoke: {
        src: 'load',
        input: getActorInput,
        onDone: [
          {
            guard: { type: 'loadedWorkspaceNeedsRender', params: getActorOutput },
            target: 'active.rendering',
            actions: { type: 'restoreWorkspace', params: getActorOutput },
          },
          {
            target: 'active.ready',
            actions: { type: 'restoreWorkspace', params: getActorOutput },
          },
        ],
        onError: {
          target: 'active.recover',
          actions: { type: 'reportOperationError', params: getActorError },
        },
      },
    },
    deleting: {
      id: 'workspace-deleting',
      tags: ['deleting', 'storageBusy'],
      entry: 'clearOperationError',
      invoke: {
        src: 'delete',
        input: getActorInput,
        onDone: { target: 'active.rendering', actions: 'acceptDeletedWorkspace' },
        onError: {
          target: 'active.recover',
          actions: { type: 'reportOperationError', params: getActorError },
        },
      },
    },
  },
});

export const APP_MACHINE_CONFIG = {
  id: 'm2rd',
  type: 'parallel',
  context: APP_INITIAL_CONTEXT,
  on: {
    'layout.update': { actions: 'updateLayout' },
    'sidebar.update': { actions: 'updateSidebar' },
    'version-history.update': { actions: 'updateVersionHistory' },
    'toolkit.update': { actions: 'updateToolkit' },
    'error.dismiss': { actions: 'clearErrors' },
    'error.view': { actions: 'showError' },
  },
  states: { document: DOCUMENT, title: TITLE, exporting: EXPORTING },
} satisfies Parameters<typeof appSetup.createMachine>[0];
