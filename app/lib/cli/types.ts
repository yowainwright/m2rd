export interface CliOptions {
  ascii: boolean;
  width: number;
  output?: string;
}

export interface CliDiagram {
  source: string;
  label: string;
}

export interface RenderedMermaid {
  family: 'flowchart' | 'sequence' | 'state';
  svg: Document;
  data: unknown;
}
