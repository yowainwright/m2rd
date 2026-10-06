'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useEffect } from 'react';
import type { ChangeEvent } from 'react';
import {
  EdgeLabelRenderer,
  NodeToolbar,
  Position,
  ReactFlow,
  Controls,
  useStore,
  useStoreApi,
  Background,
} from 'reactflow';
import type { EdgeChange, NodeChange, Viewport } from 'reactflow';
import { AppContext } from '@/app';
import { STATE_SYMBOLS } from '@/app/graph/state/constants';
import type { ReactFlowErrorGateProps } from '@/app/types';
import {
  clampEdgeWidth,
  getSelectedNodes,
  getSelectedEdges,
  getElementIds,
  getSelectedNode,
  getSelectedEdge,
  getNodeFillValue,
  getNodeTextValue,
  getEdgeColorValue,
  getEdgeWidthValue,
  getEdgeMarkerValue,
  getEdgeTypeValue,
  getEdgeAnimationValue,
  getEdgeAnchor,
  getNodeBorderValue,
  getNodeGradientValue,
  getNodeShadowValueForNode,
  getNodeShapeValue,
  getNodeSurfaceValue,
} from '@/app/graph';
import { CanvasBackground } from '@/app/components/canvas';
import type {
  GraphCanvasSettings,
  GraphGradientSettings,
  GraphPatternSettings,
  GraphShaderSettings,
  TranslationSettings,
  GraphElements,
} from '@/app/graph';
import {
  CANVAS_GRID,
  CANVAS_BACKGROUND_OPTIONS,
  EDGE_ANIMATION_OPTIONS,
  EDGE_MARKER_OPTIONS,
  EDGE_TYPE_OPTIONS,
  NODE_BORDER_OPTIONS,
  NODE_SHADOW_OPTIONS,
  NODE_SHAPE_OPTIONS,
  NODE_SURFACE_OPTIONS,
  TOOLKIT_LABELS,
} from '@/app/components/toolkit/constants';
import { ToolkitMetadata } from '@/app/components/toolkit/utils';
import { Button } from '@/app/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { Separator } from '@/app/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip';
import { EDGE_ANCHOR_STYLE } from '@/app/constants';
import { getSelectionLabel, handleReactFlowError } from '@/app/utils';
import {
  RENDER_EDGE_TYPES,
  RENDER_NODE_TYPES,
  RENDER_LABELS,
  RENDER_PRO_OPTIONS,
  RENDER_MIN_ZOOM,
} from './constants';
import type { GraphCanvasProps, PreviewProps, RenderSend, RenderToolkitProps } from './types';

export function getPreviewSelection(elements: GraphElements) {
  const selectedEdgeIds = getElementIds(getSelectedEdges(elements.edges));
  const selectedNodeIds = getElementIds(getSelectedNodes(elements.nodes));
  const selectedEdge = getSelectedEdge(elements.edges, selectedEdgeIds);
  const selectedNode = getSelectedNode(elements.nodes, selectedNodeIds);
  const selectedEdgeAnchor = selectedEdge ? getEdgeAnchor(selectedEdge, elements.nodes) : null;
  const hasSelectedEdge = selectedEdge !== undefined;
  const hasSelectedNode = selectedNode !== undefined;
  const showNodeTools = hasSelectedNode || !hasSelectedEdge;
  const isGantt = elements.nodes.some((node) => node.data?.kind === 'gantt-frame');
  const showEdgeTools = !isGantt && (hasSelectedEdge || !hasSelectedNode);
  const toolkitScope = getSelectionLabel(selectedNodeIds.length, selectedEdgeIds.length);
  return {
    selectedEdgeIds,
    selectedNodeIds,
    selectedEdge,
    selectedNode,
    selectedEdgeAnchor,
    showNodeTools,
    showEdgeTools,
    toolkitScope,
  };
}

export function getNodeToolProps({ actions, selection, translation }: PreviewProps) {
  const { selectedNode } = selection;
  const settings = translation.settings;
  const nodes = getSelectedNodes(translation.elements.nodes);
  const fillOnly = nodes.length > 0 && nodes.every((node) => STATE_SYMBOLS.has(node.data?.shape));
  return {
    fillOnly,
    preserveSemantics: ['stateDiagram', 'classDiagram', 'er', 'gantt'].includes(
      translation.diagramType || '',
    ),
    borderValue: getNodeBorderValue(selectedNode, settings),
    fillValue: getNodeFillValue(selectedNode, settings),
    gradient: getNodeGradientValue(selectedNode, settings),
    onBorderUpdate: actions.handleNodeBorder,
    onFillUpdate: actions.handleNodeColor,
    onGradientUpdate: actions.handleNodeGradient,
    onShapeUpdate: actions.handleNodeShape,
    onShadowUpdate: actions.handleNodeShadow,
    onSurfaceUpdate: actions.handleNodeSurface,
    onTextUpdate: actions.handleNodeText,
    shadowValue: getNodeShadowValueForNode(selectedNode, settings),
    shapeValue: getNodeShapeValue(selectedNode, settings),
    surfaceValue: getNodeSurfaceValue(selectedNode, settings),
    textValue: getNodeTextValue(selectedNode, settings),
  };
}

export function getEdgeToolProps({ actions, selection, translation }: PreviewProps) {
  const { selectedEdge } = selection;
  const settings = translation.settings;
  return {
    preserveSemantics: ['stateDiagram', 'classDiagram', 'er'].includes(
      translation.diagramType || '',
    ),
    animationValue: getEdgeAnimationValue(selectedEdge, settings),
    colorValue: getEdgeColorValue(selectedEdge, settings),
    markerValue: getEdgeMarkerValue(selectedEdge, settings),
    onAnimationUpdate: actions.handleEdgeAnimation,
    onColorUpdate: actions.handleEdgeColor,
    onMarkerUpdate: actions.handleEdgeMarker,
    onTypeUpdate: actions.handleEdgeType,
    onWidthUpdate: actions.handleEdgeWidth,
    typeValue: getEdgeTypeValue(selectedEdge, settings),
    widthValue: getEdgeWidthValue(selectedEdge, settings),
  };
}

export function getCanvasLayers(canvas: GraphCanvasSettings) {
  const canvasBackground = (
    <CanvasBackground
      gradient={canvas.gradient}
      pattern={canvas.pattern}
      preset={canvas.background}
      shader={canvas.shader}
    />
  );
  const shouldShowFlowGrid = canvas.gridVisible && canvas.background !== 'grid';
  const backgroundGrid = shouldShowFlowGrid ? <Background gap={CANVAS_GRID[0]} /> : null;
  return { canvasBackground, backgroundGrid };
}

function SelectedNodeIndicator({ selectedNodeId }: Pick<GraphCanvasProps, 'selectedNodeId'>) {
  if (!selectedNodeId) return null;
  return (
    <NodeToolbar
      className="nodrag nopan"
      isVisible
      nodeId={selectedNodeId}
      offset={12}
      position={Position.Top}
    >
      <div
        className="rounded-md border bg-background px-2 py-1 text-xs font-medium text-foreground shadow-sm"
        data-m2rd-export-ignore="true"
      >
        {RENDER_LABELS.nodeSelected}
      </div>
    </NodeToolbar>
  );
}

function SelectedEdgeIndicator({
  selectedEdgeAnchor,
}: Pick<GraphCanvasProps, 'selectedEdgeAnchor'>) {
  const selectedEdgeTransform = selectedEdgeAnchor
    ? `translate(-50%, -50%) translate(${selectedEdgeAnchor.x}px, ${selectedEdgeAnchor.y}px)`
    : '';
  const selectedEdgeStyle = Object.assign({}, EDGE_ANCHOR_STYLE, {
    transform: selectedEdgeTransform,
  });
  if (!selectedEdgeAnchor) return null;
  return (
    <EdgeLabelRenderer>
      <div className="nodrag nopan absolute" style={selectedEdgeStyle}>
        <div
          className="rounded-md border bg-background px-2 py-1 text-xs font-medium text-foreground shadow-sm"
          data-m2rd-export-ignore="true"
        >
          {RENDER_LABELS.edgeSelected}
        </div>
      </div>
    </EdgeLabelRenderer>
  );
}

function GraphFlowContent(props: GraphCanvasProps) {
  return (
    <ReactFlow
      defaultViewport={props.savedViewport}
      deleteKeyCode={props.canvasDeleteKey}
      edges={props.edges}
      edgeTypes={RENDER_EDGE_TYPES}
      edgesFocusable={props.canEditCanvas}
      edgesUpdatable={props.canEditCanvas}
      elementsSelectable={props.canEditCanvas}
      fitView={props.shouldFitView}
      minZoom={RENDER_MIN_ZOOM}
      nodes={props.nodes}
      nodeTypes={RENDER_NODE_TYPES}
      nodesConnectable={props.canEditCanvas}
      nodesDraggable={props.canEditCanvas}
      nodesFocusable={props.canEditCanvas}
      onEdgesChange={props.onEdgesChange}
      onError={handleReactFlowError}
      onMoveEnd={props.onMoveEnd}
      onNodesChange={props.onNodesChange}
      proOptions={RENDER_PRO_OPTIONS}
      snapGrid={CANVAS_GRID}
      snapToGrid={props.snapToGrid}
    >
      <InitialViewportSync />
      <SelectedNodeIndicator selectedNodeId={props.selectedNodeId} />
      <SelectedEdgeIndicator selectedEdgeAnchor={props.selectedEdgeAnchor} />
      {props.background}
      {props.backgroundGrid}
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowErrorGate onError={handleReactFlowError}>
      <GraphFlowContent {...props} />
    </ReactFlowErrorGate>
  );
}

export function ReactFlowErrorGate({ children, onError }: ReactFlowErrorGateProps) {
  const store = useStoreApi();
  const isReady = useStore((state) => state.onError === onError);

  useEffect(() => {
    store.setState({ onError });
  }, [onError, store]);

  if (!isReady) return null;
  return children;
}

export function InitialViewportSync() {
  const { send } = AppContext.useActorRef();
  const store = useStoreApi();
  const isInitialized = useStore((state) => {
    const hasViewport = state.d3Zoom !== null;
    const hasFitView = !state.fitViewOnInit || state.fitViewOnInitDone;
    return hasViewport && hasFitView;
  });

  useEffect(() => {
    if (!isInitialized) return;
    const [x, y, zoom] = store.getState().transform;
    send({ type: 'viewport.update', viewport: { x, y, zoom } });
  }, [isInitialized, send, store]);

  return null;
}

function RenderToolkitTrigger() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">
          <PopoverTrigger asChild>
            <Button
              aria-label={TOOLKIT_LABELS.trigger}
              className="h-8 w-8"
              size="icon"
              type="button"
              variant="outline"
            >
              <SlidersHorizontal aria-hidden="true" className="size-4" />
            </Button>
          </PopoverTrigger>
        </span>
      </TooltipTrigger>
      <TooltipContent>{TOOLKIT_LABELS.trigger}</TooltipContent>
    </Tooltip>
  );
}

export function RenderToolkit({
  canEditDraft,
  canvasTools,
  edgeTools,
  nodeTools,
  nodeToolsSeparator,
  onOpenChange,
  open,
  metadata,
}: RenderToolkitProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <RenderToolkitTrigger />
      <PopoverContent
        align="end"
        aria-label={TOOLKIT_LABELS.title}
        className="w-80 max-h-(--radix-popover-content-available-height) overflow-y-auto bg-background p-3 pb-5 text-foreground"
      >
        <fieldset disabled={!canEditDraft} className="grid gap-3">
          <ToolkitMetadata {...metadata} />
          <Separator />
          {canvasTools}
          <Separator />
          {nodeTools}
          {nodeToolsSeparator}
          {edgeTools}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}

const createNodeActions = (send: RenderSend) => {
  const update = (settings: Partial<TranslationSettings>) =>
    send({ type: 'nodes.style', settings });
  const handleColor = (event: ChangeEvent<HTMLInputElement>) =>
    update({ primaryColor: event.target.value });
  const handleText = (event: ChangeEvent<HTMLInputElement>) =>
    update({ inverseColor: event.target.value });
  const handleBorder = (value: string) => {
    const option = NODE_BORDER_OPTIONS.find((item) => item.value === value);
    if (option) update({ nodeBorder: option.value });
  };
  const handleShadow = (value: string) => {
    const option = NODE_SHADOW_OPTIONS.find((item) => item.value === value);
    if (option) update({ nodeShadow: option.value });
  };
  const handleShape = (value: string) => {
    const option = NODE_SHAPE_OPTIONS.find((item) => item.value === value);
    if (option) update({ nodeShape: option.value });
  };
  const handleSurface = (value: string) => {
    const option = NODE_SURFACE_OPTIONS.find((item) => item.value === value);
    if (option) update({ nodeSurface: option.value });
  };
  const handleGradient = (nodeGradient: GraphGradientSettings) => update({ nodeGradient });
  return {
    handleNodeColor: handleColor,
    handleNodeText: handleText,
    handleNodeBorder: handleBorder,
    handleNodeShadow: handleShadow,
    handleNodeShape: handleShape,
    handleNodeSurface: handleSurface,
    handleNodeGradient: handleGradient,
  };
};

const createEdgeActions = (send: RenderSend) => {
  const update = (settings: Partial<TranslationSettings>) =>
    send({ type: 'edges.style', settings });
  const handleColor = (event: ChangeEvent<HTMLInputElement>) =>
    update({ edgeColor: event.target.value });
  const handleWidth = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    if (Number.isFinite(value)) update({ edgeWidth: clampEdgeWidth(value) });
  };
  const handleType = (value: string) => {
    const type = EDGE_TYPE_OPTIONS.find((item) => item.value === value);
    if (type) update({ edgeType: type.value });
  };
  const handleMarker = (value: string) => {
    const marker = EDGE_MARKER_OPTIONS.find((item) => item.value === value);
    if (marker) update({ edgeMarker: marker.value });
  };
  const handleAnimation = (value: string) => {
    const animation = EDGE_ANIMATION_OPTIONS.find((item) => item.value === value);
    if (animation) update({ edgeAnimation: animation.value });
  };
  return {
    handleEdgeColor: handleColor,
    handleEdgeWidth: handleWidth,
    handleEdgeType: handleType,
    handleEdgeMarker: handleMarker,
    handleEdgeAnimation: handleAnimation,
  };
};

const createCanvasActions = (send: RenderSend) => {
  const update = (settings: Partial<GraphCanvasSettings>) =>
    send({ type: 'canvas.update', settings });
  const handleBackground = (value: string) => {
    const option = CANVAS_BACKGROUND_OPTIONS.find((item) => item.value === value);
    if (option) update({ background: option.value });
  };
  const handleGrid = (gridVisible: boolean) => update({ gridVisible });
  const handleGradient = (gradient: GraphGradientSettings) => update({ gradient });
  const handlePattern = (pattern: GraphPatternSettings) => update({ pattern });
  const handleShader = (shader: GraphShaderSettings) => update({ shader });
  const handleSnap = (snapToGrid: boolean) => update({ snapToGrid });
  const handleLock = (locked: boolean) => update({ locked });
  return {
    handleBackground,
    handleGrid,
    handleGradient,
    handlePattern,
    handleShader,
    handleSnap,
    handleLock,
  };
};

export const createRenderActions = (send: RenderSend) => {
  const nodeActions = createNodeActions(send);
  const edgeActions = createEdgeActions(send);
  const canvasActions = createCanvasActions(send);
  const handleToolkit = (open: boolean) => send({ type: 'toolkit.update', open });
  const handleNodes = (changes: NodeChange[]) => send({ type: 'nodes.update', changes });
  const handleEdges = (changes: EdgeChange[]) => send({ type: 'edges.update', changes });
  const handleLayout = () => send({ type: 'layout.reset' });
  const handleViewportBack = () => send({ type: 'viewport.back' });
  const handleViewportForward = () => send({ type: 'viewport.forward' });
  const handleViewport = (_event: MouseEvent | TouchEvent, viewport: Viewport) =>
    send({ type: 'viewport.update', viewport });
  return Object.assign({}, nodeActions, edgeActions, canvasActions, {
    handleToolkit,
    handleNodes,
    handleEdges,
    handleLayout,
    handleViewportBack,
    handleViewportForward,
    handleViewport,
  });
};
