import type { ReadStream } from 'node:tty';

export interface ViewerSize {
  columns: number;
  rows: number;
}

export interface ViewerSvgExport {
  source: string;
  path: string;
}

export interface ViewerDiagram {
  diagram: string;
  label: string;
}

export interface ViewerNavigation {
  items: ViewerDiagram[];
  index: number;
}

export interface ViewerProps {
  diagram: string | ViewerDiagram[];
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
  navigation?: ViewerNavigation;
}

export type ViewerEvent =
  | { type: 'scroll'; x: number; y: number }
  | { type: 'resize'; width: number; height: number }
  | { type: 'home' }
  | { type: 'end' }
  | { type: 'save' }
  | { type: 'previous' }
  | { type: 'next' }
  | { type: 'quit' };

export interface TerminalInput {
  stream: ReadStream;
  owned: boolean;
}
