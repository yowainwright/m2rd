'use client';

import { Crosshair, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { ReactFlowProvider, useReactFlow } from 'reactflow';
import { getWorkspaceLabel } from '@/app/graph';
import { Button } from '@/app/components/ui/button';
import { CanvasTools, EdgeTools, NodeTools } from '@/app/components/toolkit';
import { DEFAULT_CANVAS_SETTINGS } from '@/app/components/toolkit/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Separator } from '@/app/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip';
import { AppContext } from '@/app';
import {
  createRenderActions,
  getCanvasLayers,
  getEdgeToolProps,
  getNodeToolProps,
  getPreviewSelection,
  GraphCanvas,
  RenderToolkit,
} from './utils';
import { RENDER_LABELS } from './constants';
import type { PreviewProps } from './types';

function useToolkitMetadata({ selection, translation }: PreviewProps) {
  const versions = AppContext.useSelector((state) => state.context.versions);
  const workspace = AppContext.useSelector((state) => state.context.workspace);
  const inputId = AppContext.useSelector((state) => state.context.input.id);
  const activeVersion = versions.find((version) => version.id === inputId);
  const workspaceLabel = getWorkspaceLabel(workspace);
  return {
    elements: translation.elements,
    scope: selection.toolkitScope,
    selectedEdgeIds: selection.selectedEdgeIds,
    selectedNodeIds: selection.selectedNodeIds,
    version: activeVersion,
    workspaceName: workspaceLabel,
  };
}

function PreviewCanvasTools({ actions, canvas }: PreviewProps) {
  return (
    <CanvasTools
      gradient={canvas.gradient}
      onBackgroundUpdate={actions.handleBackground}
      onGradientUpdate={actions.handleGradient}
      onGridUpdate={actions.handleGrid}
      onLockUpdate={actions.handleLock}
      onPatternUpdate={actions.handlePattern}
      onShaderUpdate={actions.handleShader}
      onSnapUpdate={actions.handleSnap}
      pattern={canvas.pattern}
      shader={canvas.shader}
      settings={canvas}
    />
  );
}

function PreviewToolkit(props: PreviewProps) {
  const { actions, selection } = props;
  const toolkitOpen = AppContext.useSelector((state) => state.context.toolkitOpen);
  const canEditDraft = AppContext.useSelector((state) => state.matches({ document: 'active' }));
  const metadata = useToolkitMetadata(props);
  const nodeToolProps = getNodeToolProps(props);
  const edgeToolProps = getEdgeToolProps(props);
  const nodeTools = selection.showNodeTools ? <NodeTools {...nodeToolProps} /> : null;
  const edgeTools = selection.showEdgeTools ? <EdgeTools {...edgeToolProps} /> : null;
  const nodeToolsSeparator =
    selection.showNodeTools && selection.showEdgeTools ? <Separator /> : null;
  return (
    <RenderToolkit
      canEditDraft={canEditDraft}
      canvasTools={<PreviewCanvasTools {...props} />}
      edgeTools={edgeTools}
      metadata={metadata}
      nodeTools={nodeTools}
      nodeToolsSeparator={nodeToolsSeparator}
      onOpenChange={actions.handleToolkit}
      open={toolkitOpen}
    />
  );
}

function BackViewportButton({ actions }: Pick<PreviewProps, 'actions'>) {
  const canGoBack = AppContext.useSelector((state) => state.can({ type: 'viewport.back' }));
  const previousViewport = AppContext.useSelector((state) => state.context.viewportHistory.at(-1));
  const { setViewport } = useReactFlow();
  const handleBack = () => {
    if (!previousViewport) return;
    actions.handleViewportBack();
    void setViewport(previousViewport);
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">
          <Button
            aria-label={RENDER_LABELS.back}
            className="h-8 w-8"
            disabled={!canGoBack}
            onClick={handleBack}
            size="icon"
            type="button"
            variant="outline"
          >
            <Undo2 aria-hidden="true" className="size-4" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{RENDER_LABELS.back}</TooltipContent>
    </Tooltip>
  );
}

function ForwardViewportButton({ actions }: Pick<PreviewProps, 'actions'>) {
  const canGoForward = AppContext.useSelector((state) => state.can({ type: 'viewport.forward' }));
  const nextViewport = AppContext.useSelector((state) =>
    state.context.viewportForwardHistory.at(-1),
  );
  const { setViewport } = useReactFlow();
  const handleForward = () => {
    if (!nextViewport) return;
    actions.handleViewportForward();
    void setViewport(nextViewport);
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">
          <Button
            aria-label={RENDER_LABELS.forward}
            className="h-8 w-8"
            disabled={!canGoForward}
            onClick={handleForward}
            size="icon"
            type="button"
            variant="outline"
          >
            <Redo2 aria-hidden="true" className="size-4" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{RENDER_LABELS.forward}</TooltipContent>
    </Tooltip>
  );
}

function ViewportButtons({ actions }: Pick<PreviewProps, 'actions'>) {
  const hasNavigationHistory = AppContext.useSelector(({ context }) => {
    const hasBackHistory = context.viewportHistory.length > 0;
    const hasForwardHistory = context.viewportForwardHistory.length > 0;
    return hasBackHistory || hasForwardHistory;
  });
  if (!hasNavigationHistory) return null;
  return (
    <>
      <BackViewportButton actions={actions} />
      <ForwardViewportButton actions={actions} />
    </>
  );
}

function RecenterButton() {
  const { fitView } = useReactFlow();
  const handleRecenter = () => void fitView();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">
          <Button
            aria-label={RENDER_LABELS.recenter}
            className="h-8 w-8"
            onClick={handleRecenter}
            size="icon"
            type="button"
            variant="outline"
          >
            <Crosshair aria-hidden="true" className="size-4" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{RENDER_LABELS.recenter}</TooltipContent>
    </Tooltip>
  );
}

function PreviewHeader(props: PreviewProps) {
  const canReset = AppContext.useSelector((state) => state.can({ type: 'layout.reset' }));
  return (
    <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
      <CardTitle className="text-sm">{RENDER_LABELS.output}</CardTitle>
      <div className="flex items-center gap-2">
        <ViewportButtons actions={props.actions} />
        <RecenterButton />
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0">
              <Button
                aria-label={RENDER_LABELS.resetLayout}
                className="h-8 w-8"
                disabled={!canReset}
                onClick={props.actions.handleLayout}
                size="icon"
                type="button"
                variant="outline"
              >
                <RotateCcw aria-hidden="true" className="size-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{RENDER_LABELS.resetLayout}</TooltipContent>
        </Tooltip>
        <PreviewToolkit {...props} />
      </div>
    </CardHeader>
  );
}

function PreviewCanvas({ actions, canvas, selection, translation }: PreviewProps) {
  const canEditDraft = AppContext.useSelector((state) => state.matches({ document: 'active' }));
  const isRendering = AppContext.useSelector((state) => state.hasTag('rendering'));
  const canEditCanvas = canEditDraft && !isRendering && !canvas.locked;
  const canvasDeleteKey = canEditCanvas ? 'Backspace' : null;
  const { canvasBackground, backgroundGrid } = getCanvasLayers(canvas);
  const savedViewport = translation.view.viewport;
  const shouldFitView = !savedViewport;
  return (
    <GraphCanvas
      background={canvasBackground}
      backgroundGrid={backgroundGrid}
      canEditCanvas={canEditCanvas}
      canvasDeleteKey={canvasDeleteKey}
      edges={translation.elements.edges}
      nodes={translation.elements.nodes}
      onEdgesChange={actions.handleEdges}
      onMoveEnd={actions.handleViewport}
      onNodesChange={actions.handleNodes}
      savedViewport={savedViewport}
      selectedEdgeAnchor={selection.selectedEdgeAnchor}
      selectedNodeId={selection.selectedNode?.id}
      shouldFitView={shouldFitView}
      snapToGrid={canvas.snapToGrid}
    />
  );
}

function GraphPreviewContent() {
  const { send } = AppContext.useActorRef();
  const translation = AppContext.useSelector((state) => state.context.translation);
  const canvas = Object.assign({}, DEFAULT_CANVAS_SETTINGS, translation.view.canvas);
  const selection = getPreviewSelection(translation.elements);
  const actions = createRenderActions(send);
  const props = { actions, canvas, selection, translation };
  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <PreviewHeader {...props} />
      <CardContent className="min-h-0 flex-1 p-0">
        <PreviewCanvas {...props} />
      </CardContent>
    </Card>
  );
}

export function GraphPreview() {
  const canvasRevision = AppContext.useSelector((state) => state.context.canvasRevision);
  return (
    <ReactFlowProvider key={canvasRevision}>
      <GraphPreviewContent />
    </ReactFlowProvider>
  );
}
