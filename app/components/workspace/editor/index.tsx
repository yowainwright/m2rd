'use client';

import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { AppContext } from '@/app';
import { cn } from '@/app/lib/utils';
import { useEditorDiagnostics } from '@/app/hooks/useEditorDiagnostics';
import { ErrorIndicator, WorkspacePanelToggle } from '../utils';

const CodeMirror = dynamic(() => import('@uiw/react-codemirror'), { ssr: false });

function MermaidEditorHeader({
  isFocused,
  onToggleCollapse,
}: {
  isFocused: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <CardHeader className="flex-row items-center justify-between space-y-0">
      <CardTitle className="text-sm">Mermaid input</CardTitle>
      <div className="flex items-center gap-1">
        <ErrorIndicator />
        <WorkspacePanelToggle isFocused={isFocused} panel="mermaid" onToggle={onToggleCollapse} />
      </div>
    </CardHeader>
  );
}

export function MermaidEditor({
  isCollapsed,
  isFocused,
  onToggleCollapse,
}: {
  isCollapsed: boolean;
  isFocused: boolean;
  onToggleCollapse: () => void;
}) {
  const extensions = useEditorDiagnostics();
  const { send } = AppContext.useActorRef();
  const source = AppContext.useSelector((state) => state.context.input.source);
  const canEditDraft = AppContext.useSelector((state) => state.matches({ document: 'active' }));
  const handleSourceUpdate = (nextSource: string) =>
    send({ type: 'input.update', source: nextSource });

  return (
    <Card className={cn('flex h-full min-h-0 flex-col overflow-hidden', isCollapsed && 'hidden')}>
      <MermaidEditorHeader isFocused={isFocused} onToggleCollapse={onToggleCollapse} />
      <CardContent className="min-h-0 flex-1 p-0">
        <CodeMirror
          basicSetup
          className="h-full min-h-0"
          readOnly={!canEditDraft}
          extensions={extensions}
          height="100%"
          value={source}
          onChange={handleSourceUpdate}
        />
      </CardContent>
    </Card>
  );
}
