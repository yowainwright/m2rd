'use client';

import { useCallback } from 'react';
import Image from 'next/image';
import { Plus, Trash2 } from 'lucide-react';
import { GRAPH_SAMPLES } from '@/app/constants';
import type { GraphDiagramType } from '@/app/graph';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import { Button } from '@/app/components/ui/button';
import { InputGroupAddon, InputGroupButton } from '@/app/components/ui/input-group';
import { SidebarTrigger } from '@/app/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip';
import { AppContext } from '@/app';
import { getSaveLabel, logAppEvent } from '@/app/utils';
import { useSaveShortcut } from '@/app/hooks/useSaveShortcut';
import { ExportMenu, WorkspaceTitle } from './utils';
import {
  HEADER_LABELS,
  REPOSITORY_URL,
  SAVE_KEY_SHORTCUTS,
  SAVE_SHORTCUT_LABEL,
} from './constants';
import type { ExportMenuProps, SaveControlProps } from './types';

export function WorkspaceHeader() {
  return (
    <header className="grid min-h-12 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-4 py-2">
      <HeaderBrand />
      <HeaderTitle />
      <HeaderActions />
    </header>
  );
}

function HeaderTitle() {
  const actor = AppContext.useActorRef();
  const canSave = AppContext.useSelector((state) => state.can({ type: 'workspace.save' }));
  const saveLabel = AppContext.useSelector(getSaveLabel);
  const handleSave = useCallback(() => {
    const isEditingTitle = actor.getSnapshot().matches({ title: 'editing' });
    if (isEditingTitle) actor.send({ type: 'title.confirm' });
    if (actor.getSnapshot().matches({ title: 'editing' })) return;
    const shouldSave = actor.getSnapshot().can({ type: 'workspace.save' });
    if (!shouldSave) return;
    logAppEvent('workspace.save');
    actor.send({ type: 'workspace.save' });
  }, [actor]);
  useSaveShortcut(handleSave);
  return (
    <div className="col-span-3 row-start-2 flex min-w-0 items-center justify-center gap-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
      <CreateControl />
      <WorkspaceTitle>
        <SaveControl canSave={canSave} saveLabel={saveLabel} onSave={handleSave} />
      </WorkspaceTitle>
    </div>
  );
}

function SaveControl({ canSave, saveLabel, onSave }: SaveControlProps) {
  const saveText = saveLabel.toLowerCase();
  return (
    <InputGroupAddon align="inline-end" className="shrink-0">
      <InputGroupButton
        aria-label={saveLabel}
        aria-keyshortcuts={SAVE_KEY_SHORTCUTS}
        className="rounded-sm bg-[#f5f5f5] text-xs font-bold text-foreground hover:bg-accent"
        disabled={!canSave}
        size="xs"
        variant="default"
        onClick={onSave}
      >
        {saveText}
        <span aria-hidden="true">({SAVE_SHORTCUT_LABEL})</span>
      </InputGroupButton>
    </InputGroupAddon>
  );
}

function HeaderActions() {
  const { send } = AppContext.useActorRef();
  const canExport = AppContext.useSelector((state) =>
    state.can({
      type: 'export.start',
      request: { format: 'svg', repeat: 'forever' },
    }),
  );
  const handleExport: ExportMenuProps['onExport'] = (format, repeat) => {
    if (format === 'gif') {
      logAppEvent('translation.read', { format, repeat });
    } else {
      logAppEvent('translation.read', { format });
    }
    send({ type: 'export.start', request: { format, repeat } });
  };
  return (
    <div className="col-start-3 row-start-1 flex items-center gap-2 justify-self-end">
      <ExportMenu canExport={canExport} onExport={handleExport} />
      <DeleteControl />
    </div>
  );
}

function DeleteControl() {
  const { send } = AppContext.useActorRef();
  const canDelete = AppContext.useSelector((state) => state.can({ type: 'workspace.delete' }));
  const handleDelete = () => {
    logAppEvent('workspace.delete');
    send({ type: 'workspace.delete' });
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">
          <Button
            aria-label={HEADER_LABELS.delete}
            className="h-7 w-7"
            disabled={!canDelete}
            size="icon"
            type="button"
            variant="ghost"
            onClick={handleDelete}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{HEADER_LABELS.delete}</TooltipContent>
    </Tooltip>
  );
}

function HeaderBrand() {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <SidebarTrigger className="[&>svg]:size-4" title={HEADER_LABELS.sidebar} />
      <h1 className="text-xl leading-none font-bold">{HEADER_LABELS.title}</h1>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild className="h-7 w-7" size="icon" variant="ghost">
            <a
              aria-label={HEADER_LABELS.repository}
              href={REPOSITORY_URL}
              target="_blank"
              rel="noreferrer"
            >
              <Image
                src="/m2rd/github.svg"
                alt=""
                width={16}
                height={16}
                className="size-4 dark:invert"
              />
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{HEADER_LABELS.repository}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function CreateControl() {
  const { send } = AppContext.useActorRef();
  const canNavigate = AppContext.useSelector((state) => state.can({ type: 'workspace.create' }));
  const handleCreate = (sample: GraphDiagramType) => {
    logAppEvent('workspace.create');
    send({ type: 'workspace.create', sample });
  };
  const items = Object.entries(GRAPH_SAMPLES).map(([key, sample]) => (
    <DropdownMenuItem
      key={key}
      className="text-xs"
      onSelect={() => handleCreate(sample.diagramType)}
    >
      {sample.label}
    </DropdownMenuItem>
  ));
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={HEADER_LABELS.create}
              className="h-7 w-7"
              disabled={!canNavigate}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Plus aria-hidden="true" className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{HEADER_LABELS.create}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start">{items}</DropdownMenuContent>
    </DropdownMenu>
  );
}
