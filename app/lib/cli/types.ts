export interface CliOptions {
  ascii: boolean;
  width: number;
  output?: string;
}

export interface RenderedMermaid {
  family: 'flowchart' | 'sequence' | 'state';
  svg: Document;
  data: unknown;
}
