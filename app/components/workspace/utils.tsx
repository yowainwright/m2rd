'use client';

import { Effect } from 'effect';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AppContext } from '@/app';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip';
import { getMermaidErrorLine } from '@/app/lib/mermaid';
import type { ErrorDetailsProps, ErrorSourceLineProps, ErrorSourceProps } from './types';

const PANEL_NAMES = {
  mermaid: 'Mermaid input',
  'react-flow': 'React Flow output',
} as const;

type PanelToggleProps = {
  isFocused: boolean;
  panel: 'mermaid' | 'react-flow';
  onToggle: () => void;
};

const getPanelToggleIcon = (panel: PanelToggleProps['panel'], isFocused: boolean) => {
  const isFocusedMermaid = panel === 'mermaid' && isFocused;
  const isFocusedReactFlow = panel === 'react-flow' && isFocused;
  if (isFocusedMermaid) return ChevronLeft;
  if (isFocusedReactFlow) return ChevronRight;
  if (panel === 'mermaid') return ChevronRight;
  return ChevronLeft;
};

export function WorkspacePanelToggle({ isFocused, panel, onToggle }: PanelToggleProps) {
  const label = isFocused ? 'Restore split view' : `Expand ${PANEL_NAMES[panel]} pane`;
  const accessibleName = `Toggle focus for ${PANEL_NAMES[panel]} pane`;
  const Icon = getPanelToggleIcon(panel, isFocused);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={accessibleName}
          aria-controls="workspace-panels"
          aria-pressed={isFocused}
          className="w-8 px-0"
          size="sm"
          type="button"
          variant="outline"
          onClick={onToggle}
        >
          <Icon aria-hidden="true" className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ErrorIndicator() {
  const { send } = AppContext.useActorRef();
  const error = AppContext.useSelector((state) => {
    if (state.context.needsRender) return null;
    return state.context.translation.error;
  });
  if (!error) return null;
  const open = () => send({ type: 'error.view' });
  return (
    <Button className="h-5 px-1 text-xs text-destructive" variant="ghost" onClick={open}>
      View error
    </Button>
  );
}

export function WorkspaceErrors() {
  const { send } = AppContext.useActorRef();
  const context = AppContext.useSelector((state) => state.context);
  const operationError = context.operationError || context.exportError;
  const translationError = context.needsRender ? null : context.translation.error;
  const error = operationError || translationError;
  const hidden = !error || context.errorDialogDismissed;
  if (hidden) return null;
  const source = operationError ? null : context.input.source;
  const dismiss = () => send({ type: 'error.dismiss' });
  const handleOpenChange = (open: boolean) => {
    if (!open) dismiss();
  };
  const label = operationError ? 'Operation error' : 'Mermaid error';
  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-xl border-border p-0 shadow-xl"
        overlayClassName="bg-background/80 backdrop-blur-xs"
      >
        <DialogHeader className="shrink-0 px-6 pt-6 text-left">
          <DialogTitle className="self-start rounded-md bg-destructive/10 px-2 py-1 font-mono text-sm text-destructive">
            {label}
          </DialogTitle>
          <DialogDescription className="sr-only">Unable to update the graph</DialogDescription>
        </DialogHeader>
        <ErrorDetails error={error} source={source} />
        <DialogFooter className="shrink-0 border-t border-border bg-muted/30 px-6 py-3">
          <Button variant="outline" size="sm" onClick={dismiss}>
            Dismiss
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ErrorDetails({ error, source }: ErrorDetailsProps) {
  const line = source === null ? null : Effect.runSync(getMermaidErrorLine(source, error));
  const message = error.replace(/^Mermaid: /, '');
  const [heading] = message.split('\n');
  const summary = line ? heading.replace(/on line \d+/, `on line ${line}`) : heading;
  const unknownType = message.startsWith('No diagram type detected');
  const title = unknownType ? 'Unknown diagram type' : summary;
  const showSource = source !== null && line !== null;
  const detailStart = message.startsWith('Parse error on line') ? 3 : 1;
  const details = unknownType
    ? 'Start with flowchart, sequenceDiagram, stateDiagram-v2, classDiagram, erDiagram, or gantt.'
    : message.split('\n').slice(detailStart).join('\n');
  return (
    <div className="min-h-0 space-y-5 overflow-y-auto p-6">
      <p className="text-lg font-medium leading-relaxed wrap-anywhere" role="alert">
        {title}
      </p>
      {showSource && <ErrorSource source={source} line={line} />}
      {details && (
        <p className="font-mono text-xs leading-6 whitespace-pre-wrap text-muted-foreground wrap-anywhere">
          {details}
        </p>
      )}
    </div>
  );
}

function ErrorSource({ source, line }: ErrorSourceProps) {
  const lines = source.split('\n');
  const start = Math.max(0, line - 3);
  const excerpt = lines.slice(start, line + 2).map((text, index) => {
    const number = start + index + 1;
    const active = number === line;
    return <ErrorSourceLine key={number} text={text} number={number} active={active} />;
  });
  return (
    <Card className="overflow-hidden border-border bg-muted/40 shadow-none">
      <CardHeader className="border-b border-border px-4 py-3">
        <CardTitle className="font-mono text-xs font-normal">Mermaid input · line {line}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0 py-3">
        <pre className="min-w-max font-mono text-xs leading-6">
          <code>{excerpt}</code>
        </pre>
      </CardContent>
    </Card>
  );
}

function ErrorSourceLine({ text, number, active }: ErrorSourceLineProps) {
  const className = active ? 'block bg-destructive/5 px-4' : 'block px-4';
  const marker = active ? '>' : ' ';
  const label = String(number).padStart(3);
  return (
    <span className={className}>
      <span className="select-none text-destructive" aria-hidden="true">
        {marker}{' '}
      </span>
      <span className="select-none text-muted-foreground" aria-hidden="true">
        {label} │{' '}
      </span>
      {text}
      {'\n'}
    </span>
  );
}
