'use client';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/app/components/ui/resizable';
import { usePanelRef, type PanelProps, type PanelSize } from 'react-resizable-panels';
import { SidebarInset, SidebarProvider } from '@/app/components/ui/sidebar';
import { useWorkspaceLayout } from '@/app/hooks/useWorkspaceLayout';
import { AppContext } from '@/app';
import type { AppEvent } from '@/app/types';
import { cn } from '@/app/lib/utils';
import { MermaidEditor } from './editor';
import { WorkspaceHeader } from './header';
import { GraphPreview } from './render';
import { WorkspaceSidebar } from './sidebar';
import type { WorkspacePanelsProps } from './types';
import { WorkspaceErrors } from './utils';

const COLLAPSED_PANEL_SIZE = 0;

const createPanelResizeHandler =
  (send: (event: AppEvent) => void, panel: 'mermaid' | 'react-flow') =>
  (size: PanelSize, _id: string | number | undefined, previousSize: PanelSize | undefined) => {
    if (!previousSize) return;
    const wasCollapsed = previousSize.inPixels <= COLLAPSED_PANEL_SIZE;
    const isCollapsed = size.inPixels <= COLLAPSED_PANEL_SIZE;
    if (wasCollapsed === isCollapsed) return;
    send({ type: 'layout.panel.update', panel, collapsed: isCollapsed });
  };

const togglePanel = (panel: ReturnType<typeof usePanelRef>['current'], isCollapsed: boolean) => {
  if (!panel) return;
  if (isCollapsed) panel.expand();
  else panel.collapse();
};

export function Workspace() {
  const { send } = AppContext.useActorRef();
  const isDesktop = AppContext.useSelector((state) => state.context.isDesktop);
  const isLayoutReady = isDesktop !== null;
  const isDesktopLayout = isDesktop === true;
  const sidebarOpen = AppContext.useSelector((state) => state.context.sidebarOpen);
  const panelOrientation = isDesktopLayout ? 'horizontal' : 'vertical';
  const panelMinimumSize = isDesktopLayout ? '320px' : '520px';
  const handleSidebarUpdate = (open: boolean) => send({ type: 'sidebar.update', open });

  useWorkspaceLayout();

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={handleSidebarUpdate}>
      <WorkspaceSidebar />
      <SidebarInset className="min-h-dvh min-w-0 text-foreground lg:h-dvh">
        <WorkspaceHeader />
        <WorkspaceErrors />
        <WorkspacePanels
          isDesktop={isDesktopLayout}
          isLayoutReady={isLayoutReady}
          panelMinimumSize={panelMinimumSize}
          panelOrientation={panelOrientation}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}

function useWorkspacePanelControls() {
  const { send } = AppContext.useActorRef();
  const mermaidPanelCollapsed = AppContext.useSelector(
    (state) => state.context.mermaidPanelCollapsed,
  );
  const reactFlowPanelCollapsed = AppContext.useSelector(
    (state) => state.context.reactFlowPanelCollapsed,
  );
  const mermaidPanelRef = usePanelRef();
  const reactFlowPanelRef = usePanelRef();
  const handleMermaidPanelToggle = () =>
    togglePanel(reactFlowPanelRef.current, reactFlowPanelCollapsed);
  const handleReactFlowPanelToggle = () =>
    togglePanel(mermaidPanelRef.current, mermaidPanelCollapsed);
  return {
    handleMermaidPanelToggle,
    handleReactFlowPanelToggle,
    mermaidPanelCollapsed,
    mermaidPanelRef,
    reactFlowPanelCollapsed,
    reactFlowPanelRef,
    send,
  };
}

type WorkspacePanelGroupProps = WorkspacePanelsProps & {
  controls: ReturnType<typeof useWorkspacePanelControls>;
};

type WorkspacePanelLayoutProps = WorkspacePanelGroupProps & {
  isFocusMode: boolean;
  onMermaidResize: PanelProps['onResize'];
  onReactFlowResize: PanelProps['onResize'];
};

type WorkspacePaneProps = {
  minSize: string;
  onResize: PanelProps['onResize'];
  panelRef: ReturnType<typeof usePanelRef>;
  isCollapsed: boolean;
  isSiblingHidden: boolean;
  onToggleCollapse: () => void;
};

function WorkspacePanels(props: WorkspacePanelsProps) {
  const controls = useWorkspacePanelControls();
  const sectionClassName = cn(
    'h-[70rem] shrink-0 p-4 lg:h-auto lg:min-h-0 lg:flex-1',
    !props.isLayoutReady && 'invisible',
  );
  return (
    <section className={sectionClassName}>
      <WorkspacePanelGroup {...props} controls={controls} />
    </section>
  );
}

function WorkspacePanelGroup(props: WorkspacePanelGroupProps) {
  const { controls } = props;
  const isFocusMode = controls.mermaidPanelCollapsed || controls.reactFlowPanelCollapsed;
  const onMermaidResize = createPanelResizeHandler(controls.send, 'mermaid');
  const onReactFlowResize = createPanelResizeHandler(controls.send, 'react-flow');
  return (
    <WorkspacePanelLayout
      {...props}
      isFocusMode={isFocusMode}
      onMermaidResize={onMermaidResize}
      onReactFlowResize={onReactFlowResize}
    />
  );
}

function WorkspacePanelLayout(props: WorkspacePanelLayoutProps) {
  return (
    <ResizablePanelGroup
      className={cn('gap-4', props.isFocusMode && 'gap-0')}
      disabled={!props.isDesktop}
      id="workspace-panels"
      orientation={props.panelOrientation}
    >
      <MermaidResizablePanel
        minSize={props.panelMinimumSize}
        onResize={props.onMermaidResize}
        panelRef={props.controls.mermaidPanelRef}
        isCollapsed={props.controls.mermaidPanelCollapsed}
        isSiblingHidden={props.controls.reactFlowPanelCollapsed}
        onToggleCollapse={props.controls.handleMermaidPanelToggle}
      />
      <ResizableHandle
        aria-label="Resize Mermaid and React Flow panels"
        className={props.isFocusMode ? 'hidden' : 'hidden lg:flex'}
        withHandle
      />
      <ReactFlowResizablePanel
        minSize={props.panelMinimumSize}
        onResize={props.onReactFlowResize}
        panelRef={props.controls.reactFlowPanelRef}
        isCollapsed={props.controls.reactFlowPanelCollapsed}
        isSiblingHidden={props.controls.mermaidPanelCollapsed}
        onToggleCollapse={props.controls.handleReactFlowPanelToggle}
      />
    </ResizablePanelGroup>
  );
}

function MermaidResizablePanel({
  minSize,
  onResize,
  panelRef,
  isCollapsed,
  isSiblingHidden,
  onToggleCollapse,
}: WorkspacePaneProps) {
  return (
    <ResizablePanel
      collapsedSize={`${COLLAPSED_PANEL_SIZE}px`}
      collapsible
      defaultSize="45%"
      id="mermaid-panel"
      minSize={minSize}
      onResize={onResize}
      panelRef={panelRef}
    >
      <MermaidEditor
        isCollapsed={isCollapsed}
        isFocused={isSiblingHidden}
        onToggleCollapse={onToggleCollapse}
      />
    </ResizablePanel>
  );
}

function ReactFlowResizablePanel({
  minSize,
  onResize,
  panelRef,
  isCollapsed,
  isSiblingHidden,
  onToggleCollapse,
}: WorkspacePaneProps) {
  return (
    <ResizablePanel
      collapsedSize={`${COLLAPSED_PANEL_SIZE}px`}
      collapsible
      defaultSize="55%"
      id="flow-panel"
      minSize={minSize}
      onResize={onResize}
      panelRef={panelRef}
    >
      <GraphPreview
        isCollapsed={isCollapsed}
        isFocused={isSiblingHidden}
        onToggleCollapse={onToggleCollapse}
      />
    </ResizablePanel>
  );
}
