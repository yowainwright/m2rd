import type { ReactNode } from 'react';
import type { Edge, EdgeChange, Node, NodeChange, Viewport } from 'reactflow';
import type { ToolkitMetadataProps } from '@/app/components/toolkit/types';
import type { AppEvent } from '@/app/types';
import type { GraphCanvasSettings, GraphTranslation } from '@/app/graph';
import type { createRenderActions, getPreviewSelection } from './utils';

export type RenderSend = (event: AppEvent) => void;
export type GraphPoint = { x: number; y: number };

export type PreviewProps = {
  actions: ReturnType<typeof createRenderActions>;
  canvas: GraphCanvasSettings;
  selection: ReturnType<typeof getPreviewSelection>;
  translation: GraphTranslation;
};

export type GraphCanvasProps = {
  background: ReactNode;
  backgroundGrid: ReactNode;
  canEditCanvas: boolean;
  canvasDeleteKey: 'Backspace' | null;
  edges: Edge[];
  nodes: Node[];
  onEdgesChange: (changes: EdgeChange[]) => void;
  onMoveEnd: (event: MouseEvent | TouchEvent, viewport: Viewport) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  savedViewport?: Viewport;
  selectedEdgeAnchor: GraphPoint | null;
  selectedNodeId?: string;
  shouldFitView: boolean;
  snapToGrid: boolean;
};

export type RenderToolkitProps = {
  canEditDraft: boolean;
  canvasTools: ReactNode;
  edgeTools: ReactNode;
  nodeTools: ReactNode;
  nodeToolsSeparator: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  metadata: ToolkitMetadataProps;
};
