import type { SnapshotLink, SnapshotProvenance } from '@/app/graph/snapshot';
import type { ReactNode } from 'react';
import type { EdgeChange, NodeChange, Viewport } from 'reactflow';
import type { GifExportRepeat } from '@/app/export';
import type {
  GraphCanvasSettings,
  GraphDiagramType,
  GraphInput,
  GraphRecords,
  GraphTranslation,
  GraphVersion,
  GraphWorkspace,
  TranslationSettings,
} from '@/app/graph';

export type WorkspaceRequest = { workspaceId: string; versionId?: string };
export type WorkspaceOperation =
  | { type: 'workspace.create'; sample?: GraphDiagramType }
  | { type: 'workspace.save' }
  | { type: 'workspace.load'; request: WorkspaceRequest }
  | { type: 'workspace.delete' };
export type ExportRequest = { format: 'svg' | 'png' | 'gif'; repeat: GifExportRepeat };
export type RemoteSnapshot = SnapshotProvenance & { url: string };
export type RemoteDraft = {
  saveId: string;
  workspaceId: string;
  snapshot: string;
  target?: SnapshotLink;
  forkId?: string;
  reconcileOnly?: boolean;
};
export type SharedSnapshot = RemoteSnapshot & { forkedFrom?: SnapshotProvenance; svg?: string };
export type AccountSnapshot = Pick<RemoteSnapshot, 'gistId' | 'revision' | 'url'> & {
  title: string;
};
export type AppContext = {
  isDesktop: boolean | null;
  mermaidPanelCollapsed: boolean;
  reactFlowPanelCollapsed: boolean;
  sidebarOpen: boolean;
  versionHistoryOpen: boolean;
  toolkitOpen: boolean;
  canvasRevision: number;
  needsRender: boolean;
  resetLayout: boolean;
  errorDialogDismissed: boolean;
  operationError: string | null;
  titleDraft: string;
  titleError: string | null;
  afterRename: WorkspaceOperation | null;
  exportError: string | null;
  loadRequest: WorkspaceRequest | null;
  viewportHistory: Viewport[];
  viewportForwardHistory: Viewport[];
  exportRequest: ExportRequest;
  remote: SharedSnapshot | null;
  remoteDraft: RemoteDraft | null;
  remoteAccount: string | null;
  remoteError: string | null;
  accountSnapshots: AccountSnapshot[];
  input: GraphInput;
  translation: GraphTranslation;
  workspace: GraphWorkspace;
  workspaces: GraphWorkspace[];
  versions: GraphVersion[];
};

export type AppEvent =
  | WorkspaceOperation
  | { type: 'remote.account' }
  | { type: 'remote.save' }
  | { type: 'remote.resume' }
  | { type: 'remote.authorize' }
  | { type: 'remote.discard' }
  | { type: 'remote.discard.confirm' }
  | { type: 'remote.discard.cancel' }
  | { type: 'remote.signOut' }
  | { type: 'remote.copy' }
  | { type: 'remote.list' }
  | { type: 'layout.update'; isDesktop: boolean }
  | { type: 'layout.panel.update'; panel: 'mermaid' | 'react-flow'; collapsed: boolean }
  | { type: 'sidebar.update'; open: boolean }
  | { type: 'version-history.update'; open: boolean }
  | { type: 'toolkit.update'; open: boolean }
  | { type: 'workspace.rename'; name: string }
  | { type: 'title.edit' }
  | { type: 'title.confirm' }
  | { type: 'title.cancel' }
  | { type: 'input.update'; source: string }
  | { type: 'nodes.update'; changes: NodeChange[] }
  | { type: 'edges.update'; changes: EdgeChange[] }
  | { type: 'nodes.style'; settings: Partial<TranslationSettings> }
  | { type: 'edges.style'; settings: Partial<TranslationSettings> }
  | { type: 'canvas.update'; settings: Partial<GraphCanvasSettings> }
  | { type: 'viewport.update'; viewport: Viewport }
  | { type: 'viewport.back' }
  | { type: 'viewport.forward' }
  | { type: 'layout.reset' }
  | { type: 'error.dismiss' }
  | { type: 'error.view' }
  | { type: 'export.start'; request: ExportRequest };

export type LoadedWorkspace = {
  records: GraphRecords | null;
  shared?: SharedSnapshot;
  pending?: RemoteDraft;
  resumePending?: boolean;
  sharedError?: string;
  workspaces: GraphWorkspace[];
};
export type ReactFlowErrorHandler = (code: string, message: string) => void;
export type ReactFlowErrorGateProps = {
  children: ReactNode;
  onError: ReactFlowErrorHandler;
};
