'use client';

import { useCallback, useEffect } from 'react';
import Image from 'next/image';
import { ChevronDown, Share2, Trash2 } from 'lucide-react';
import { GRAPH_SAMPLES } from '@/app/constants';
import type { GraphDiagramType } from '@/app/graph';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
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
    <header className="grid min-h-12 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-2 py-2 sm:px-4">
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
      <DiagramTypeControl />
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
    <div className="col-start-3 row-start-1 flex items-center gap-1 justify-self-end sm:gap-2">
      <SignInControl />
      <RemoteControl />
      <DiscardRemoteDialog />
      <ExportMenu canExport={canExport} onExport={handleExport} />
      <DeleteControl />
    </div>
  );
}

function SignInControl() {
  const { send } = AppContext.useActorRef();
  const account = AppContext.useSelector((state) => state.context.remoteAccount);
  const authorize = { type: 'remote.authorize', resumeSave: false } as const;
  const canSignIn = AppContext.useSelector((state) => state.can(authorize));
  useEffect(() => {
    send({ type: 'remote.account' });
  }, [send]);
  if (account) return null;
  return (
    <Button
      className="h-7 px-2"
      size="sm"
      variant="outline"
      disabled={!canSignIn}
      onClick={() => send(authorize)}
    >
      Sign in
    </Button>
  );
}

function RemoteControl() {
  const { send } = AppContext.useActorRef();
  const account = AppContext.useSelector((state) => state.context.remoteAccount);
  const saving = AppContext.useSelector((state) => state.hasTag('remoteSaving'));
  const canSave = AppContext.useSelector((state) => state.can({ type: 'remote.save' }));
  const canCopy = AppContext.useSelector((state) => state.can({ type: 'remote.copy' }));
  const hasDraft = AppContext.useSelector((state) => Boolean(state.context.remoteDraft));
  const accountText = account ? 'Signed in with GitHub' : 'GitHub sign-in required';
  const saveText = hasDraft ? 'Retry GitHub save' : 'Save to GitHub';
  const checkAccount = (open: boolean) => {
    if (open) send({ type: 'remote.account' });
  };
  const label = saving ? 'Saving to GitHub' : 'Share';
  return (
    <DropdownMenu onOpenChange={checkAccount}>
      <DropdownMenuTrigger asChild>
        <Button aria-label={label} variant="ghost" size="icon" className="h-7 w-7" type="button">
          <Share2 aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-64">
        <DropdownMenuLabel>{accountText}</DropdownMenuLabel>
        <DropdownMenuLabel className="whitespace-normal font-normal">
          Anyone with an unlisted Gist link can view it.
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!canSave} onSelect={() => send({ type: 'remote.save' })}>
          {saveText}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canCopy} onSelect={() => send({ type: 'remote.copy' })}>
          Copy saved link
        </DropdownMenuItem>
        <DiscardRemoteItem />
        <AccountSignOut />
        <RemoteFeedback />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DiscardRemoteItem() {
  const { send } = AppContext.useActorRef();
  const hasDraft = AppContext.useSelector((state) => state.context.remoteDraft !== null);
  const canDiscard = AppContext.useSelector((state) => state.can({ type: 'remote.discard' }));
  if (!hasDraft) return null;
  const discard = () => send({ type: 'remote.discard' });
  return (
    <DropdownMenuItem disabled={!canDiscard} onSelect={discard}>
      Discard pending save…
    </DropdownMenuItem>
  );
}

function DiscardRemoteDialog() {
  const { send } = AppContext.useActorRef();
  const open = AppContext.useSelector((state) => state.matches({ remote: 'confirmingDiscard' }));
  const cancel = () => send({ type: 'remote.discard.cancel' });
  const confirm = () => send({ type: 'remote.discard.confirm' });
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) cancel();
  };
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discard pending GitHub save?</DialogTitle>
          <DialogDescription>
            GitHub may already have saved this graph. Saving again may create a duplicate. Your
            edits stay in the editor, and existing GitHub saves will remain.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={cancel}>
            Keep pending save
          </Button>
          <Button onClick={confirm}>Discard pending save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountSignOut() {
  const { send } = AppContext.useActorRef();
  const account = AppContext.useSelector((state) => state.context.remoteAccount);
  if (!account) return null;
  return (
    <DropdownMenuItem onSelect={() => send({ type: 'remote.signOut' })}>Sign out</DropdownMenuItem>
  );
}

function RemoteFeedback() {
  const saving = AppContext.useSelector((state) => state.hasTag('remoteSaving'));
  const copied = AppContext.useSelector((state) => state.hasTag('remoteCopied'));
  const error = AppContext.useSelector((state) => state.context.remoteError);
  return (
    <>
      {saving && <DropdownMenuLabel role="status">Saving to GitHub…</DropdownMenuLabel>}
      {copied && <DropdownMenuLabel role="status">Saved link copied</DropdownMenuLabel>}
      {error && (
        <DropdownMenuLabel role="alert" className="whitespace-normal">
          {error}
        </DropdownMenuLabel>
      )}
    </>
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

function DiagramTypeControl() {
  const selected = AppContext.useSelector(
    (state) => state.context.translation.diagramType ?? 'flowchart',
  );
  const label = GRAPH_SAMPLES[selected].label;
  const canNavigate = AppContext.useSelector((state) => state.can({ type: 'workspace.create' }));
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`${HEADER_LABELS.diagramType}: ${label}`}
              className="h-7 shrink-0 gap-1 px-2"
              disabled={!canNavigate}
              size="sm"
              type="button"
              variant="ghost"
            >
              {label}
              <ChevronDown aria-hidden="true" className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{HEADER_LABELS.diagramType}</TooltipContent>
      </Tooltip>
      <DiagramTypeOptions />
    </DropdownMenu>
  );
}

function DiagramTypeOptions() {
  const { send } = AppContext.useActorRef();
  const openGraph = (sample: GraphDiagramType) => {
    logAppEvent('workspace.create');
    send({ type: 'workspace.create', sample });
  };
  const items = Object.values(GRAPH_SAMPLES).map(({ diagramType, label }) => (
    <DropdownMenuItem key={diagramType} className="text-xs" onSelect={() => openGraph(diagramType)}>
      {label}
    </DropdownMenuItem>
  ));
  return <DropdownMenuContent align="start">{items}</DropdownMenuContent>;
}
