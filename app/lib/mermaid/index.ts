import { Effect } from 'effect';
import type { Diagnostic } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';

const REMOVED_SOURCE = [
  /^([^\S\n\r]*)-{3}\s*[\n\r]([\s\S]*?)[\n\r]\1-{3}\s*[\n\r]+/g,
  /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi,
  /^\s*%%(?!{)[^\n]+\n?/gm,
  /^\s+/g,
];

const removeSource = (source: string, offsets: number[], pattern: RegExp) => {
  const matches = Array.from(source.matchAll(pattern));
  const removed = new Set(
    matches.flatMap((match) =>
      Array.from({ length: match[0].length }, (_, index) => match.index + index),
    ),
  );
  const remaining = offsets.filter((_, index) => !removed.has(index));
  return { source: source.replace(pattern, ''), offsets: remaining };
};

export const getMermaidErrorLine = (source: string, error: string) =>
  Effect.sync(() => {
    const reported = error.match(/^(?:Mermaid: )?(?:Parse|Lexical) error on line (\d+)/i);
    const unknownType = error.startsWith('Mermaid: No diagram type detected');
    const hasLocation = reported || unknownType;
    if (!hasLocation) return null;
    const offsets = Array.from({ length: source.length }, (_, index) => index);
    const mapped = REMOVED_SOURCE.reduce(
      (current, pattern) => removeSource(current.source, current.offsets, pattern),
      { source, offsets },
    );
    const lines = mapped.source.trimEnd().split('\n');
    const number = Math.min(Number(reported?.[1] || 1), lines.length);
    if (number < 1) return null;
    const prefix = lines.slice(0, number - 1).join('\n');
    const start = prefix.length + Number(number > 1);
    const offset = mapped.offsets[start];
    return source.slice(0, offset ?? source.length).split('\n').length;
  });

export const getMermaidDiagnostics = (doc: EditorView['state']['doc'], error: string | null) =>
  Effect.gen(function* () {
    if (!error) return [];
    const number = yield* getMermaidErrorLine(doc.toString(), error);
    if (!number) return [];
    const line = doc.line(number);
    const from = line.from + line.text.length - line.text.trimStart().length;
    const message = error.replace(/^Mermaid: /, '').replace(/on line \d+/, `on line ${number}`);
    const diagnostic: Diagnostic = { from, to: line.to, severity: 'error', message };
    return [diagnostic];
  });
