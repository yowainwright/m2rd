'use client';

import { getWorkspaceLabel } from '@/app/graph';
import { Button } from '@/app/components/ui/button';
import { CanvasTools, EdgeTools, NodeTools } from '@/app/components/toolkit';
import { DEFAULT_CANVAS_SETTINGS } from '@/app/components/toolkit/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { cn } from '@/app/lib/utils';
import { Separator } from '@/app/components/ui/separator';
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
import { WorkspacePanelToggle } from '../utils';

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

type PreviewHeaderProps = {
  props: PreviewProps;
  isFocused: boolean;
  onToggleCollapse: () => void;
};

function PreviewHeaderActions({
  props,
  canReset,
  isFocused,
  onToggleCollapse,
}: PreviewHeaderProps & { canReset: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        type="button"
        variant="outline"
        onClick={props.actions.handleLayout}
        disabled={!canReset}
      >
        {RENDER_LABELS.resetLayout}
      </Button>
      <PreviewToolkit {...props} />
      <WorkspacePanelToggle isFocused={isFocused} panel="react-flow" onToggle={onToggleCollapse} />
    </div>
  );
}

function PreviewHeader({ props, isFocused, onToggleCollapse }: PreviewHeaderProps) {
  const canReset = AppContext.useSelector((state) => state.can({ type: 'layout.reset' }));
  return (
    <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
      <CardTitle className="text-sm">{RENDER_LABELS.output}</CardTitle>
      <PreviewHeaderActions
        canReset={canReset}
        isFocused={isFocused}
        onToggleCollapse={onToggleCollapse}
        props={props}
      />
    </CardHeader>
  );
}

function PreviewCanvas({ actions, canvas, selection, translation }: PreviewProps) {
  const canvasRevision = AppContext.useSelector((state) => state.context.canvasRevision);
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
      canvasRevision={canvasRevision}
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

export function GraphPreview({
  isCollapsed,
  isFocused,
  onToggleCollapse,
}: {
  isCollapsed: boolean;
  isFocused: boolean;
  onToggleCollapse: () => void;
}) {
  const { send } = AppContext.useActorRef();
  const translation = AppContext.useSelector((state) => state.context.translation);
  const canvas = Object.assign({}, DEFAULT_CANVAS_SETTINGS, translation.view.canvas);
  const selection = getPreviewSelection(translation.elements);
  const actions = createRenderActions(send);
  const props = { actions, canvas, selection, translation };
  return (
    <Card className={cn('flex h-full min-h-0 flex-col overflow-hidden', isCollapsed && 'hidden')}>
      <PreviewHeader isFocused={isFocused} onToggleCollapse={onToggleCollapse} props={props} />
      <CardContent className="min-h-0 flex-1 p-0">
        <PreviewCanvas {...props} />
      </CardContent>
    </Card>
  );
}
