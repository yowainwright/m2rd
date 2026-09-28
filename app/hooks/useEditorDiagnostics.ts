'use client';

import { useMemo } from 'react';
import { linter } from '@codemirror/lint';
import { Effect } from 'effect';
import { AppContext } from '@/app';
import { EDITOR_EXTENSIONS } from '@/app/components/workspace/editor/constants';
import { getMermaidDiagnostics } from '@/app/lib/mermaid';

export function useEditorDiagnostics() {
  const error = AppContext.useSelector((state) => {
    if (state.context.needsRender) return null;
    return state.context.translation.error;
  });
  return useMemo(() => {
    const diagnostics = linter(
      (view) => Effect.runSync(getMermaidDiagnostics(view.state.doc, error)),
      { delay: 0 },
    );
    return [EDITOR_EXTENSIONS, diagnostics];
  }, [error]);
}
