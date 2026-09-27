'use client';

import { cn } from '@/app/lib/utils';
import { ChevronRight, FileX, Workflow, X } from 'lucide-react';
import { getWorkspaceLabel } from '@/app/graph';
import type { GraphWorkspace } from '@/app/graph';
import { Button } from '@/app/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/app/components/ui/empty';
import { Separator } from '@/app/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/app/components/ui/sidebar';
import { AppContext } from '@/app';
import VersionTree, { type VersionTreeItem } from './versiontree';
import {
  APP_LICENSE,
  APP_VERSION,
  CURRENT_YEAR,
  EMPTY_GRAPHS,
  FOOTER_SUPPORTED_DIAGRAMS,
  OSS_ADDITIONAL_CREDITS,
  OSS_CREDITS,
  OSS_FRAMEWORK_CREDITS,
  REPOSITORY_URL,
} from './constants';

function useWorkspaceNavigation() {
  const { send } = AppContext.useActorRef();
  const activeId = AppContext.useSelector((state) => state.context.workspace.id);
  const activeVersionId = AppContext.useSelector((state) => state.context.input.id);
  const versionHistoryOpen = AppContext.useSelector((state) => state.context.versionHistoryOpen);
  const versions = AppContext.useSelector((state) => state.context.versions);
  const canNavigate = AppContext.useSelector((state) => state.can({ type: 'workspace.create' }));
  const { setOpenMobile } = useSidebar();
  const versionItems: VersionTreeItem[] = versions.map((version) => {
    return { id: version.id, timestamp: version.updatedAt, version: version.version };
  });
  const handleVersionSelect = (versionId: string) => {
    send({ type: 'workspace.load', request: { workspaceId: activeId, versionId } });
    setOpenMobile(false);
  };
  const handleWorkspaceClick = (workspaceId: string) => {
    const isCurrent = workspaceId === activeId;
    if (isCurrent) {
      send({ type: 'version-history.update', open: !versionHistoryOpen });
      return;
    }
    send({ type: 'workspace.load', request: { workspaceId } });
    send({ type: 'version-history.update', open: true });
    setOpenMobile(false);
  };
  const disabled = !canNavigate;
  return {
    activeId,
    activeVersionId,
    disabled,
    versionHistoryOpen,
    versionItems,
    handleVersionSelect,
    handleWorkspaceClick,
  };
}

type WorkspaceRowProps = {
  workspace: GraphWorkspace;
  navigation: ReturnType<typeof useWorkspaceNavigation>;
};

function WorkspaceVersionHistory({ workspace, navigation }: WorkspaceRowProps) {
  const isActive = workspace.id === navigation.activeId;
  const isOpen = isActive && navigation.versionHistoryOpen;
  if (!isOpen) return null;
  return (
    <VersionTree
      activeId={navigation.activeVersionId}
      disabled={navigation.disabled}
      onSelect={navigation.handleVersionSelect}
      versions={navigation.versionItems}
    />
  );
}

function WorkspaceRow({ workspace, navigation }: WorkspaceRowProps) {
  const { activeId, disabled, versionHistoryOpen, handleWorkspaceClick } = navigation;
  const label = getWorkspaceLabel(workspace);
  const isActive = workspace.id === activeId;
  return (
    <SidebarMenuItem key={workspace.id}>
      <SidebarMenuButton
        aria-expanded={isActive ? versionHistoryOpen : false}
        disabled={disabled}
        isActive={isActive}
        onClick={() => handleWorkspaceClick(workspace.id)}
        title={label}
        type="button"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn('transition-transform', isActive && versionHistoryOpen && 'rotate-90')}
        />
        <Workflow aria-hidden="true" />
        <span>{label}</span>
      </SidebarMenuButton>
      <WorkspaceVersionHistory workspace={workspace} navigation={navigation} />
    </SidebarMenuItem>
  );
}

function WorkspaceList() {
  const workspaces = AppContext.useSelector((state) => state.context.workspaces);
  const navigation = useWorkspaceNavigation();
  const items = workspaces.map((workspace) => (
    <WorkspaceRow key={workspace.id} workspace={workspace} navigation={navigation} />
  ));
  const isEmpty = workspaces.length === 0;
  const graphList = isEmpty ? <WorkspaceEmptyState /> : <SidebarMenu>{items}</SidebarMenu>;
  return (
    <SidebarContent className="overflow-hidden">
      <SidebarGroup className="min-h-0 flex-1">
        <SidebarGroupLabel asChild>
          <h2>Saved graphs</h2>
        </SidebarGroupLabel>
        <SidebarGroupContent className="min-h-0 flex-1 overflow-y-auto">
          <nav aria-label="Saved graphs">{graphList}</nav>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  );
}

function CloseSidebarButton() {
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const handleClose = () => {
    if (isMobile) {
      setOpenMobile(false);
      return;
    }
    setOpen(false);
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label="Close sidebar"
          size="icon"
          type="button"
          variant="ghost"
          onClick={handleClose}
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Close sidebar</TooltipContent>
    </Tooltip>
  );
}

function WorkspaceSidebarHeader() {
  return (
    <SidebarHeader className="min-h-12 border-b px-4 py-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">m2rd</p>
          <p className="text-[10px] leading-3 text-muted-foreground">mermaid to react diagrams</p>
        </div>
        <CloseSidebarButton />
      </div>
    </SidebarHeader>
  );
}

export function WorkspaceSidebar() {
  return (
    <Sidebar>
      <WorkspaceSidebarHeader />
      <WorkspaceList />
      <WorkspaceCredits />
    </Sidebar>
  );
}

function WorkspaceEmptyState() {
  return (
    <Empty className="p-4 md:p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileX aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-sm">{EMPTY_GRAPHS.title}</EmptyTitle>
        <EmptyDescription className="text-xs">{EMPTY_GRAPHS.description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function WorkspaceCreditLinks() {
  const tools = OSS_CREDITS.concat(OSS_ADDITIONAL_CREDITS, OSS_FRAMEWORK_CREDITS);
  const credits = tools.map(({ name, href }) => (
    <li key={name}>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="hover:underline focus-visible:underline"
      >
        {name}
      </a>
    </li>
  ));
  const coreCredits = credits.slice(0, OSS_CREDITS.length);
  const frameworkStart = OSS_CREDITS.length + OSS_ADDITIONAL_CREDITS.length;
  const additionalCredits = credits.slice(OSS_CREDITS.length, frameworkStart);
  const frameworkCredits = credits.slice(frameworkStart);

  return (
    <ul aria-label="Open-source credits" className="flex flex-col gap-1 px-2 text-foreground">
      <li>
        <ul className="flex justify-center gap-3 whitespace-nowrap">{coreCredits}</ul>
      </li>
      <li>
        <ul className="flex justify-center gap-3 whitespace-nowrap">{additionalCredits}</ul>
      </li>
      <li>
        <ul className="flex justify-center gap-3 whitespace-nowrap">{frameworkCredits}</ul>
      </li>
    </ul>
  );
}

function WorkspaceCredits() {
  return (
    <SidebarFooter className="shrink-0 items-center gap-3 border-t border-sidebar-border px-2 pt-4 pb-6 text-center text-xs text-muted-foreground">
      <p className="w-full px-6 text-left text-xs leading-5">
        <a
          href={REPOSITORY_URL}
          target="_blank"
          rel="noreferrer"
          className="hover:underline focus-visible:underline"
        >
          m2rd
        </a>{' '}
        {FOOTER_SUPPORTED_DIAGRAMS}
      </p>
      <Separator className="bg-sidebar-border" />
      <WorkspaceCreditLinks />
      <Separator className="bg-sidebar-border" />
      <p className="px-2">
        {APP_VERSION} · {APP_LICENSE} · {CURRENT_YEAR}
      </p>
    </SidebarFooter>
  );
}
