import mermaid from 'mermaid';
import { renderClassDiagram } from '../class';
import { GRAPH_DIAGRAM_TYPES } from '../constants';
import { renderErDiagram } from '../er';
import { renderGanttDiagram } from '../gantt';
import { renderStateDiagram } from '../state';
import { parseMermaidSvg } from '../svg';
import {
  GraphRenderError,
  type GraphDiagramType,
  type GraphRenderResult,
  type TranslationSettings,
} from '../types';

export const initializeBrowserRenderer = () => {
  mermaid.initialize({
    securityLevel: 'strict',
    sequence: {
      mirrorActors: true,
      actorFontSize: 16,
      messageFontSize: 16,
      noteFontSize: 14,
      messageMargin: 48,
      boxTextMargin: 10,
    },
    startOnLoad: false,
    themeVariables: { rectBkgColor: 'transparent' },
  });
};

export const renderGraph = async (
  source: string,
  settings: TranslationSettings,
  svgDocument?: Document,
) => {
  const id = `m2rd-${crypto.randomUUID()}`;
  const parsed = await mermaid.parse(source);
  const detectedType = getSupportedDiagramType(parsed.diagramType);
  const nativeRenderer = {
    stateDiagram: renderStateDiagram,
    classDiagram: renderClassDiagram,
    er: renderErDiagram,
    gantt: renderGanttDiagram,
  };
  const isNative = detectedType !== 'flowchart' && detectedType !== 'sequence';
  if (isNative) {
    const elements = await nativeRenderer[detectedType](id, source, settings);
    return { diagramType: detectedType, elements } satisfies GraphRenderResult;
  }
  const result = await mermaid.render(id, source);
  const diagramType = getSupportedDiagramType(result.diagramType);
  const elements = parseMermaidSvg(result.svg, settings, diagramType, svgDocument);
  return { diagramType, elements } satisfies GraphRenderResult;
};

export const getSupportedDiagramType = (diagramType: string): GraphDiagramType => {
  const normalizedType = diagramType === 'flowchart-v2' ? 'flowchart' : diagramType;
  const isSupported = GRAPH_DIAGRAM_TYPES.includes(normalizedType as GraphDiagramType);
  if (!isSupported) {
    throw new GraphRenderError(
      'unsupported',
      `Mermaid diagram type "${diagramType}" is not supported in the React Flow view yet.`,
      diagramType,
    );
  }
  return normalizedType as GraphDiagramType;
};
