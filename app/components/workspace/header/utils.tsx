'use client';

import { useEffect, useRef } from 'react';
import { Download } from 'lucide-react';
import { AppContext } from '@/app';
import {
  APP_INITIAL_CONTEXT,
  GRAPH_NAME_ERROR_ID,
  GRAPH_NAME_LABEL,
  RENAME_GRAPH_LABEL,
} from '@/app/constants';
import { getWorkspaceLabel } from '@/app/graph';
import { UNTITLED_GRAPH_NAME } from '@/app/graph/constants';
import { Button } from '@/app/components/ui/button';
import { InputGroup, InputGroupInput } from '@/app/components/ui/input-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import { HEADER_LABELS } from './constants';
import type {
  ExportMenuProps,
  TitleInteraction,
  WorkspaceTitleEditorProps,
  WorkspaceTitleLabelProps,
  WorkspaceTitleProps,
} from './types';

export function WorkspaceTitle({ children }: WorkspaceTitleProps) {
  const actor = AppContext.useActorRef();
  const editing = AppContext.useSelector((state) => state.matches({ title: 'editing' }));
  const saving = AppContext.useSelector((state) => state.matches({ title: 'saving' }));
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const showInput = editing || saving;

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
    const shouldRestoreFocus = !showInput && restoreFocus.current;
    if (shouldRestoreFocus) {
      button.current?.focus();
      restoreFocus.current = false;
    }
  }, [editing, showInput]);

  const handlers = getTitleHandlers({ actor, restoreFocus });
  if (!showInput) {
    return <WorkspaceTitleLabel button={button}>{children}</WorkspaceTitleLabel>;
  }
  return (
    <WorkspaceTitleEditor input={input} {...handlers}>
      {children}
    </WorkspaceTitleEditor>
  );
}

export function ExportMenu({ canExport, onExport }: ExportMenuProps) {
  return (
    <DropdownMenu>
      <ExportMenuTrigger canExport={canExport} />
      <DropdownMenuContent align="end" className="min-w-0">
        <DropdownMenuItem className="text-xs" onSelect={() => onExport('svg', 'forever')}>
          SVG
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs" onSelect={() => onExport('png', 'forever')}>
          PNG
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs" onSelect={() => onExport('gif', 'forever')}>
          GIF loop
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs" onSelect={() => onExport('gif', 'once')}>
          GIF once
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function getTitleHandlers({ actor, restoreFocus }: TitleInteraction) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const isConfirm = event.key === 'Enter';
    const isCancel = event.key === 'Escape';
    const isOtherKey = !isConfirm && !isCancel;
    if (isOtherKey) return;
    event.preventDefault();
    event.stopPropagation();
    restoreFocus.current = true;
    const type = isCancel ? 'title.cancel' : 'title.confirm';
    actor.send({ type });
  };
  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const staysInGroup = event.currentTarget.contains(event.relatedTarget);
    if (staysInGroup) return;
    if (!actor.getSnapshot().matches({ title: 'editing' })) return;
    restoreFocus.current = false;
    actor.send({ type: 'title.cancel' });
  };

  return { handleKeyDown, handleBlur };
}

function WorkspaceTitleLabel({ button, children }: WorkspaceTitleLabelProps) {
  const actor = AppContext.useActorRef();
  const workspace = AppContext.useSelector((state) => state.context.workspace);
  const isSaved = AppContext.useSelector(
    (state) => state.context.input.id !== APP_INITIAL_CONTEXT.input.id,
  );
  const canEdit = AppContext.useSelector((state) => state.can({ type: 'title.edit' }));
  const fallback = isSaved ? workspace.id : UNTITLED_GRAPH_NAME;
  const label = getWorkspaceLabel(workspace, fallback);
  return (
    <InputGroup className="w-96 min-w-0 max-w-full" aria-label={HEADER_LABELS.graphNameAndSave}>
      <Button
        ref={button}
        aria-label={RENAME_GRAPH_LABEL}
        disabled={!canEdit}
        title={label}
        variant="ghost"
        className="h-full min-w-0 flex-1 justify-start px-3 font-bold"
        onClick={() => actor.send({ type: 'title.edit' })}
      >
        <span className="truncate">{label}</span>
      </Button>
      {children}
    </InputGroup>
  );
}

function WorkspaceTitleEditor(props: WorkspaceTitleEditorProps) {
  const { input, children, handleKeyDown, handleBlur } = props;
  const actor = AppContext.useActorRef();
  const draft = AppContext.useSelector((state) => state.context.titleDraft);
  const error = AppContext.useSelector((state) => state.context.titleError);
  const saving = AppContext.useSelector((state) => state.matches({ title: 'saving' }));
  const errorId = error ? GRAPH_NAME_ERROR_ID : undefined;
  return (
    <div className="w-96 min-w-0 max-w-full">
      <InputGroup aria-label={HEADER_LABELS.graphNameAndSave} onBlur={handleBlur}>
        <InputGroupInput
          ref={input}
          aria-label={GRAPH_NAME_LABEL}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          aria-busy={saving}
          disabled={saving}
          value={draft}
          placeholder={GRAPH_NAME_LABEL}
          className="h-full min-w-0 font-bold"
          onKeyDown={handleKeyDown}
          onChange={(event) => actor.send({ type: 'workspace.rename', name: event.target.value })}
        />
        {children}
      </InputGroup>
      {error && (
        <p id={GRAPH_NAME_ERROR_ID} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function ExportMenuTrigger({ canExport }: Pick<ExportMenuProps, 'canExport'>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={HEADER_LABELS.download}
              className="h-7 w-7"
              disabled={!canExport}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Download aria-hidden="true" className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </span>
      </TooltipTrigger>
      <TooltipContent>{HEADER_LABELS.download}</TooltipContent>
    </Tooltip>
  );
}
