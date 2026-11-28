import type { ElkExtendedEdge, ElkNode } from 'elkjs';

export interface FlowNode {
  id: string;
  label: string;
  decision: boolean;
  parentId?: string;
  frame?: boolean;
  role?: 'start' | 'end';
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  arrow: boolean;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface PanelNode extends ElkNode {
  label: string;
  decision: boolean;
  width: number;
  height: number;
  frame?: boolean;
  parentId?: string;
}

export interface TerminalLayout extends ElkNode {
  children: PanelNode[];
  edges: ElkExtendedEdge[];
  width: number;
  height: number;
}
