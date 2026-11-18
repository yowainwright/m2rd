import { parseFlowchartSvg } from '../flowchart';
import { parseSequenceSvg } from '../sequence';
import type { GraphDiagramType, GraphElements, TranslationSettings } from '../types';
import { readSvg } from './utils';

export const parseMermaidSvg = (
  source: string,
  settings: TranslationSettings,
  diagramType: GraphDiagramType = 'flowchart',
  dom?: Document,
): GraphElements => {
  const svg = readSvg(source, dom);
  if (!svg) throw new Error('Mermaid did not return an SVG.');
  if (diagramType === 'sequence') return parseSequenceSvg(svg, settings);
  return parseFlowchartSvg(svg, settings);
};
