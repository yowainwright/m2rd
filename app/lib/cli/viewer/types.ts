import type { ReadStream } from 'node:tty';

export interface ViewerSize {
  columns: number;
  rows: number;
}

export interface ViewerSvgExport {
  source: string;
  path: string;
}

export interface ViewerProps {
  diagram: string;
  ascii: boolean;
  viewport?: ViewerSize;
  svgExport?: ViewerSvgExport;
}

export interface ViewerContext {
  contentWidth: number;
  contentHeight: number;
  width: number;
  height: number;
  left: number;
  top: number;
  svgExport?: ViewerSvgExport;
  message?: string;
}

export type ViewerEvent =
  | { type: 'scroll'; x: number; y: number }
  | { type: 'resize'; width: number; height: number }
  | { type: 'home' }
  | { type: 'end' }
  | { type: 'save' }
  | { type: 'quit' };

export interface TerminalInput {
  stream: ReadStream;
  owned: boolean;
}
