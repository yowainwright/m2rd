import { Number as EffectNumber } from 'effect';
import type { CSSProperties } from 'react';
import { MarkerType, type Edge, type EdgeMarker, type Node } from 'reactflow';
import { STATE_EDGE_TYPE } from './state/constants';
import { CLASS_EDGE_TYPE } from './class/constants';
import { ER_EDGE_TYPE } from './er/constants';
import {
  DEFAULT_SETTINGS,
  EDGE_MARKER_OPTIONS,
  EDGE_TYPE_OPTIONS,
  EDGE_WIDTH_LIMITS,
  GRADIENT_DIRECTION_OPTIONS,
  NODE_PATTERN_SIZE,
  NODE_SHAPE_OPTIONS,
  SEQUENCE_MESSAGE_EDGE_TYPE,
  SEQUENCE_NODE_DEFAULTS,
  SURGE_EDGE_TYPE,
} from './constants';
import type {
  EdgeAnimation,
  EdgeMarkerValue,
  EdgeType,
  GraphElements,
  GraphGradientSettings,
  GraphTranslation,
  GradientDirection,
  TranslationSettings,
} from './types';

const SEQUENCE_MESSAGE_KIND = 'sequence-message';
const SEQUENCE_NODE_KINDS = new Set([
  'sequence-action',
  'sequence-frame',
  'sequence-note',
  'sequence-participant',
]);
const NODE_COLOR_VARIABLE = '--m2rd-node-primary';
const NODE_SURFACE_VARIABLE = '--m2rd-node-surface';
const NODE_GRADIENT_A_VARIABLE = '--m2rd-node-gradient-a';
const NODE_GRADIENT_B_VARIABLE = '--m2rd-node-gradient-b';
const NODE_GRADIENT_DIRECTION_VARIABLE = '--m2rd-node-gradient-direction';
const NODE_GRADIENT_SPLIT_VARIABLE = '--m2rd-node-gradient-split';
const NODE_SHAPE_VARIABLE = '--m2rd-node-shape';
const NODE_SHAPE_STYLE_KEYS = [
  'aspectRatio',
  'borderRadius',
  'clipPath',
  'display',
  'alignItems',
  'justifyContent',
  'minHeight',
  'minWidth',
  'padding',
  'textAlign',
  'width',
] as const;

export const clampEdgeWidth = EffectNumber.clamp(EDGE_WIDTH_LIMITS);

const getGradientDirection = (direction: GradientDirection) => {
  if (direction === 'horizontal') return 'to right';
  if (direction === 'vertical') return 'to bottom';
  return 'circle';
};

const clampGradientSplit = (split: number) => Math.min(100, Math.max(0, split));

export const createGradientImage = (gradient: GraphGradientSettings) => {
  const split = clampGradientSplit(gradient.split);
  const firstStop = `${gradient.colorA} 0%, ${gradient.colorA} ${split}%`;
  const secondStop = `${gradient.colorB} 100%`;
  const direction = getGradientDirection(gradient.direction);
  const gradientType = gradient.direction === 'radial' ? 'radial-gradient' : 'linear-gradient';
  return `${gradientType}(${direction}, ${firstStop}, ${secondStop})`;
};

export const createDiagonalPatternImage = (color: string, size: number) => {
  return `repeating-linear-gradient(45deg, ${color} 0 1px, transparent 1px ${size}px)`;
};

export const createPolkaPinPatternImage = (color: string) => {
  return `radial-gradient(circle, ${color} 1px, transparent 1px)`;
};

const getNodeSurfaceImage = (
  surface: TranslationSettings['nodeSurface'],
  gradient: GraphGradientSettings,
) => {
  if (surface === 'gradient') return createGradientImage(gradient);
  if (surface === 'pattern-grid') {
    return 'linear-gradient(rgba(255,255,255,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.22) 1px, transparent 1px)';
  }

  if (surface === 'pattern-dots') {
    return 'radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)';
  }

  if (surface === 'pattern-diagonal') {
    return createDiagonalPatternImage('rgba(255,255,255,0.6)', NODE_PATTERN_SIZE);
  }

  if (surface === 'pattern-polka-pin') {
    return createPolkaPinPatternImage('rgba(255,255,255,0.6)');
  }

  return 'none';
};

const getNodeBackgroundSize = (surface: TranslationSettings['nodeSurface']) => {
  if (surface === 'pattern-diagonal') return 'auto';
  if (surface.startsWith('pattern-')) return `${NODE_PATTERN_SIZE}px ${NODE_PATTERN_SIZE}px`;
  return 'auto';
};

const getNodeShadow = (shadow: TranslationSettings['nodeShadow']) => {
  if (shadow === 'soft') return '0 6px 18px rgba(15, 23, 42, 0.18)';
  if (shadow === 'strong') return '0 12px 28px rgba(15, 23, 42, 0.32)';
  return 'none';
};

const getNodeShapeStyles = (shape: TranslationSettings['nodeShape']): CSSProperties => {
  if (shape === 'rectangle') return {};
  const contentStyles = {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    minHeight: '6rem',
    minWidth: '6rem',
    padding: '0.75rem 1rem',
    textAlign: 'center',
    width: 'max-content',
  } satisfies CSSProperties;
  if (shape === 'cylinder') {
    return Object.assign({}, contentStyles, {
      aspectRatio: '1.5 / 1',
      borderRadius: '50% / 15%',
      minHeight: '5rem',
      minWidth: '8rem',
    });
  }
  if (shape === 'diamond') {
    return Object.assign({}, contentStyles, {
      aspectRatio: '1 / 1',
      clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
      padding: '1.5rem 2rem',
    });
  }
  const roundShapeStyles = { aspectRatio: '1 / 1' };
  if (shape === 'circle')
    return Object.assign({}, contentStyles, roundShapeStyles, { borderRadius: '50%' });
  return Object.assign({}, contentStyles, roundShapeStyles);
};

const clearNodeShapeStyles = (style: CSSProperties & Record<string, unknown>) => {
  NODE_SHAPE_STYLE_KEYS.forEach((key) => delete style[key]);
};

const getNodeStyleValue = (style: CSSProperties | undefined, key: string) => {
  if (!style) return undefined;
  return (style as CSSProperties & Record<string, unknown>)[key];
};

const getNodeBorder = (
  style: CSSProperties | undefined,
  fallback: TranslationSettings['nodeBorder'],
) => {
  const value = getNodeStyleValue(style, 'borderStyle');
  if (typeof value === 'string') return value as TranslationSettings['nodeBorder'];
  const border = getNodeStyleValue(style, 'border');
  if (typeof border === 'string') {
    const option = ['solid', 'dashed', 'dotted', 'none'].find((item) => border.includes(item));
    if (option) return option as TranslationSettings['nodeBorder'];
  }
  return fallback;
};

const getNodeSurface = (
  style: CSSProperties | undefined,
  fallback: TranslationSettings['nodeSurface'],
) => {
  const value = getNodeStyleValue(style, NODE_SURFACE_VARIABLE);
  const hasSurface = typeof value === 'string';
  if (hasSurface) return value as TranslationSettings['nodeSurface'];
  return fallback;
};

const getGradientDirectionValue = (value: unknown, fallback: GradientDirection) => {
  const option = GRADIENT_DIRECTION_OPTIONS.find((item) => item.value === value);
  return option?.value || fallback;
};

const getNodeGradient = (style: CSSProperties | undefined, fallback: GraphGradientSettings) => {
  const colorA = getColorValue(getNodeStyleValue(style, NODE_GRADIENT_A_VARIABLE), fallback.colorA);
  const colorB = getColorValue(getNodeStyleValue(style, NODE_GRADIENT_B_VARIABLE), fallback.colorB);
  const directionValue = getNodeStyleValue(style, NODE_GRADIENT_DIRECTION_VARIABLE);
  const direction = getGradientDirectionValue(directionValue, fallback.direction);
  const splitValue = getNodeStyleValue(style, NODE_GRADIENT_SPLIT_VARIABLE);
  const split = typeof splitValue === 'number' ? splitValue : fallback.split;
  return { colorA, colorB, direction, split };
};

const getNodeShadowValue = (
  style: CSSProperties | undefined,
  fallback: TranslationSettings['nodeShadow'],
) => {
  const value = getNodeStyleValue(style, 'boxShadow');
  if (value === getNodeShadow('soft')) return 'soft';
  if (value === getNodeShadow('strong')) return 'strong';
  if (value === 'none') return 'none';
  return fallback;
};

const getNodeShape = (
  style: CSSProperties | undefined,
  fallback: TranslationSettings['nodeShape'],
) => {
  const value = getNodeStyleValue(style, NODE_SHAPE_VARIABLE);
  const option = NODE_SHAPE_OPTIONS.find((item) => item.value === value);
  return option?.value || fallback;
};

export const createNodeStyle = (settings: TranslationSettings) => {
  const borderWidth = settings.nodeBorder === 'none' ? 0 : 2;
  const backgroundSize = getNodeBackgroundSize(settings.nodeSurface);
  const colorVariable = { [NODE_COLOR_VARIABLE]: settings.primaryColor };
  const surfaceVariable = { [NODE_SURFACE_VARIABLE]: settings.nodeSurface };
  const shapeVariable = { [NODE_SHAPE_VARIABLE]: settings.nodeShape };
  const gradientVariables = {
    [NODE_GRADIENT_A_VARIABLE]: settings.nodeGradient.colorA,
    [NODE_GRADIENT_B_VARIABLE]: settings.nodeGradient.colorB,
    [NODE_GRADIENT_DIRECTION_VARIABLE]: settings.nodeGradient.direction,
    [NODE_GRADIENT_SPLIT_VARIABLE]: settings.nodeGradient.split,
  };
  return Object.assign(
    {},
    {
      backgroundColor: settings.primaryColor,
      borderColor: settings.primaryColor,
      borderStyle: settings.nodeBorder,
      borderWidth,
      boxShadow: getNodeShadow(settings.nodeShadow),
      color: settings.inverseColor,
      fontFamily: settings.fontFamily,
      backgroundImage: getNodeSurfaceImage(settings.nodeSurface, settings.nodeGradient),
      backgroundSize,
    },
    colorVariable,
    surfaceVariable,
    shapeVariable,
    gradientVariables,
    getNodeShapeStyles(settings.nodeShape),
  ) as CSSProperties;
};

export const createEdgeStyle = (settings: TranslationSettings) => {
  const strokeWidth = clampEdgeWidth(settings.edgeWidth);
  return {
    stroke: settings.edgeColor,
    strokeWidth,
  };
};

export const createEdgeMarker = (value: EdgeMarkerValue, color: string): EdgeMarker | undefined => {
  if (value === 'none') {
    return undefined;
  }

  const type = value === 'arrow' ? MarkerType.Arrow : MarkerType.ArrowClosed;
  return { type, color };
};

const colorEdgeMarker = (marker: Edge['markerEnd'], color: string) => {
  if (typeof marker !== 'object') {
    return marker;
  }

  return Object.assign({}, marker, { color });
};

export const getEdgeType = (settings: TranslationSettings) => {
  return settings.edgeType;
};

export const getEdgeAnimationClassName = (settings: TranslationSettings) => {
  if (settings.edgeAnimation !== 'pulse') {
    return '';
  }

  return 'animate-pulse';
};

export const getEdgeAnimated = (settings: TranslationSettings) => {
  return settings.edgeAnimation === 'flow';
};

export const getSelectedNodes = (nodes: Node[]) => {
  return nodes.filter((node) => node.selected === true);
};

export const getSelectedEdges = (edges: Edge[]) => {
  return edges.filter((edge) => edge.selected === true);
};

export const getElementIds = (elements: Array<Edge | Node>) => {
  return elements.map((element) => element.id);
};

const getSequenceStyleOverrides = (style: CSSProperties): CSSProperties => {
  const defaults = createNodeStyle(DEFAULT_SETTINGS) as Record<string, unknown>;
  const entries = Object.entries(style).filter(([key, value]) => value !== defaults[key]);
  return Object.fromEntries(entries);
};

export const createSequenceStyle = (settings: TranslationSettings) =>
  getSequenceStyleOverrides(createNodeStyle(settings));

const getNodeAppearanceStyle = (node: Node | undefined) => {
  if (!node) return undefined;
  if (node.data?.kind === 'state-node') return node.data.style;
  if (node.data?.kind === 'class-node') return node.data.style;
  if (node.data?.kind === 'er-node') return node.data.style;
  if (node.data?.kind === 'gantt-task') return node.data.style;
  if (node.data?.kind === 'gantt-frame') return node.data.style;
  if (!SEQUENCE_NODE_KINDS.has(node.data?.kind)) return node.style;
  const savedStyle = node.data.style || {};
  if (node.data.styleVersion === 1) return savedStyle;
  const style = getSequenceStyleOverrides(savedStyle);
  const isSourceFill =
    node.data.kind === 'sequence-frame' && style.backgroundColor === node.data.fill;
  if (!isSourceFill) return style;
  const { backgroundColor: _backgroundColor, ...overrides } = style;
  return overrides;
};

const getNodeSurfaceUpdate = (
  nodeAppearanceStyle: CSSProperties | undefined,
  settings: Partial<TranslationSettings>,
) => {
  const style: CSSProperties & Record<string, unknown> = {};
  const currentSurface = getNodeSurface(nodeAppearanceStyle, DEFAULT_SETTINGS.nodeSurface);
  const currentGradient = getNodeGradient(nodeAppearanceStyle, DEFAULT_SETTINGS.nodeGradient);
  const nextSurface = settings.nodeSurface || currentSurface;
  const nextGradient = settings.nodeGradient || currentGradient;
  if (settings.nodeSurface !== undefined) {
    style.backgroundImage = getNodeSurfaceImage(settings.nodeSurface, nextGradient);
    style.backgroundSize = getNodeBackgroundSize(settings.nodeSurface);
    style[NODE_SURFACE_VARIABLE] = settings.nodeSurface;
  }
  if (settings.nodeGradient !== undefined) {
    style.backgroundImage = getNodeSurfaceImage(nextSurface, nextGradient);
    style.backgroundSize = getNodeBackgroundSize(nextSurface);
    style[NODE_GRADIENT_A_VARIABLE] = nextGradient.colorA;
    style[NODE_GRADIENT_B_VARIABLE] = nextGradient.colorB;
    style[NODE_GRADIENT_DIRECTION_VARIABLE] = nextGradient.direction;
    style[NODE_GRADIENT_SPLIT_VARIABLE] = nextGradient.split;
  }
  return style;
};

const createNodeStyleUpdate = (node: Node, settings: Partial<TranslationSettings>) => {
  const nodeAppearanceStyle = getNodeAppearanceStyle(node);
  const style = Object.assign({}, nodeAppearanceStyle) as CSSProperties & Record<string, unknown>;
  const currentColor = getColorValue(
    style[NODE_COLOR_VARIABLE],
    getColorValue(style.backgroundColor, DEFAULT_SETTINGS.primaryColor),
  );
  const currentShape = getNodeShape(nodeAppearanceStyle, DEFAULT_SETTINGS.nodeShape);
  if (settings.primaryColor !== undefined) {
    style.backgroundColor = settings.primaryColor;
    style.borderColor = settings.primaryColor;
    style[NODE_COLOR_VARIABLE] = settings.primaryColor;
  }
  if (settings.nodeBorder !== undefined) {
    style.borderStyle = settings.nodeBorder;
    style.borderWidth = settings.nodeBorder === 'none' ? 0 : 2;
    style.borderColor = style.borderColor || currentColor;
  }
  if (settings.nodeShadow !== undefined) style.boxShadow = getNodeShadow(settings.nodeShadow);
  Object.assign(style, getNodeSurfaceUpdate(nodeAppearanceStyle, settings));
  if (settings.nodeShape !== undefined) {
    clearNodeShapeStyles(style);
    Object.assign(style, getNodeShapeStyles(settings.nodeShape));
    style[NODE_SHAPE_VARIABLE] = settings.nodeShape;
  } else if (style[NODE_SHAPE_VARIABLE] === undefined) {
    style[NODE_SHAPE_VARIABLE] = currentShape;
    Object.assign(style, getNodeShapeStyles(currentShape));
  }
  if (settings.inverseColor !== undefined) style.color = settings.inverseColor;
  if (settings.fontFamily !== undefined) style.fontFamily = settings.fontFamily;
  return style;
};

const applyNodeStyle = (node: Node, style: CSSProperties | undefined) => {
  if (node.data?.kind === 'gantt-frame') return node;
  const hasNativeSurface = ['state-node', 'class-node', 'er-node', 'gantt-task'].includes(
    node.data?.kind,
  );
  if (hasNativeSurface) {
    const data = Object.assign({}, node.data, { style: style || {} });
    return Object.assign({}, node, { data });
  }
  const isSequenceElement = SEQUENCE_NODE_KINDS.has(node.data?.kind);
  if (!isSequenceElement) return Object.assign({}, node, { style });
  const appearanceStyle = style || getNodeAppearanceStyle(node) || {};
  const frameStyle = {
    height: node.style?.height || appearanceStyle.height,
    width: node.style?.width || appearanceStyle.width,
  };
  const data = Object.assign({}, node.data, { style: appearanceStyle, styleVersion: 1 });
  return Object.assign({}, node, { data, style: frameStyle });
};

const updateEdgeMarker = (
  edge: Edge,
  key: 'markerStart' | 'markerEnd',
  value: EdgeMarkerValue | undefined,
  color: string,
) => {
  const isSequence = edge.data?.kind === SEQUENCE_MESSAGE_KIND;
  const hasNoSequenceMarker = isSequence && !edge.data?.[key];
  if (hasNoSequenceMarker) return undefined;
  if (value === undefined) return colorEdgeMarker(edge[key], color);
  return createEdgeMarker(value, color);
};

const getEdgeAppearanceUpdate = (
  edge: Edge,
  settings: Partial<TranslationSettings>,
  edgeSettings: TranslationSettings,
) => {
  const isSequenceMessage = edge.data?.kind === SEQUENCE_MESSAGE_KIND;
  const keepsAnimation = settings.edgeAnimation === undefined;
  const keepsType = settings.edgeType === undefined;
  const currentType = getEdgeTypeValue(edge, DEFAULT_SETTINGS);
  const animation = keepsAnimation
    ? getEdgeAnimationValue(edge, DEFAULT_SETTINGS)
    : edgeSettings.edgeAnimation;
  const isSurge = animation === 'surge';
  const animated = keepsAnimation ? edge.animated : getEdgeAnimated(edgeSettings);
  const className = keepsAnimation ? edge.className : getEdgeAnimationClassName(edgeSettings);
  const edgeType = keepsType ? currentType : edgeSettings.edgeType;
  let type: string = edgeType;
  if (isSequenceMessage) type = SEQUENCE_MESSAGE_EDGE_TYPE;
  if (isSurge) type = SURGE_EDGE_TYPE;
  const data = Object.assign({}, edge.data);
  const storesEdgeType = isSequenceMessage || isSurge;

  if (storesEdgeType) {
    data.edgeType = edgeType;
  } else {
    delete data.edgeType;
  }
  return { animated, className, type, data };
};

const createEdgeUpdate = (edge: Edge, settings: Partial<TranslationSettings>) => {
  const edgeSettings = getSettings(settings);
  const style = Object.assign({}, edge.style);

  if (settings.edgeColor) {
    style.stroke = settings.edgeColor;
  }

  if (settings.edgeWidth) {
    style.strokeWidth = clampEdgeWidth(settings.edgeWidth);
  }

  const color = getColorValue(style.stroke, edgeSettings.edgeColor);
  if (edge.data?.kind === 'class-relation') {
    return Object.assign({}, edge, { style, type: CLASS_EDGE_TYPE });
  }
  if (edge.data?.kind === 'er-relation') {
    return Object.assign({}, edge, { style, type: ER_EDGE_TYPE });
  }
  if (edge.data?.kind === 'state-transition') {
    const markerEnd = edge.data.arrow ? createEdgeMarker('arrowclosed', color) : undefined;
    return Object.assign({}, edge, { style, markerEnd, type: STATE_EDGE_TYPE });
  }
  const appearance = getEdgeAppearanceUpdate(edge, settings, edgeSettings);
  const isSequenceMessage = edge.data?.kind === SEQUENCE_MESSAGE_KIND;
  const isSequenceSourceSegment = isSequenceMessage && edge.data?.segment === 'source';
  const updatedMarkerEnd = updateEdgeMarker(edge, 'markerEnd', settings.edgeMarker, color);
  const markerEnd = isSequenceSourceSegment ? undefined : updatedMarkerEnd;
  const markerStart = isSequenceSourceSegment
    ? updateEdgeMarker(edge, 'markerStart', settings.edgeMarker, color)
    : undefined;

  return Object.assign({}, edge, appearance, {
    markerEnd,
    markerStart,
    style,
  });
};

export const updateSelectedNodes = (
  elements: GraphElements,
  nodeIds: string[],
  settings: Partial<TranslationSettings>,
): GraphElements => {
  const selectedIds = new Set(nodeIds);
  const nodes = elements.nodes.map((node) => {
    if (!selectedIds.has(node.id)) {
      return node;
    }

    return applyNodeStyle(node, createNodeStyleUpdate(node, settings));
  });

  return Object.assign({}, elements, { nodes });
};

export const updateSelectedEdges = (
  elements: GraphElements,
  edgeIds: string[],
  settings: Partial<TranslationSettings>,
): GraphElements => {
  const selectedIds = new Set(edgeIds);
  const edges = elements.edges.map((edge) => {
    if (!selectedIds.has(edge.id)) {
      return edge;
    }

    return createEdgeUpdate(edge, settings);
  });

  return Object.assign({}, elements, { edges });
};

export const getSelectedNode = (nodes: Node[], nodeIds: string[]) => {
  const ids = new Set(nodeIds);
  return nodes.find((node) => ids.has(node.id));
};

export const getSelectedEdge = (edges: Edge[], edgeIds: string[]) => {
  const ids = new Set(edgeIds);
  return edges.find((edge) => ids.has(edge.id));
};

const getColorValue = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') {
    return fallback;
  }

  return value;
};

const getNumberValue = (value: unknown, fallback: number) => {
  if (typeof value !== 'number') {
    return fallback;
  }

  return value;
};

const getSequenceNodeDefaults = (node: Node | undefined) => {
  const isRegion = node?.data?.kind === 'sequence-frame' && node.data.frameType === 'rect';
  const kind = isRegion ? 'sequence-region' : node?.data?.kind;
  return SEQUENCE_NODE_DEFAULTS[kind];
};

export const getNodeFillValue = (node: Node | undefined, settings: TranslationSettings) => {
  const style = getNodeAppearanceStyle(node);
  const defaultFill = getSequenceNodeDefaults(node)?.fill || settings.primaryColor;
  const sourceFill = node?.data?.sourceStyle?.backgroundColor || node?.data?.fill || defaultFill;
  return getColorValue(style?.backgroundColor, sourceFill);
};

export const getNodeTextValue = (node: Node | undefined, settings: TranslationSettings) => {
  const style = getNodeAppearanceStyle(node);
  const defaultText =
    node?.data?.sourceStyle?.color ||
    (getSequenceNodeDefaults(node) ? '#111827' : settings.inverseColor);
  return getColorValue(style?.color, defaultText);
};

export const getNodeBorderValue = (node: Node | undefined, settings: TranslationSettings) => {
  const defaultBorder = getSequenceNodeDefaults(node)?.border || settings.nodeBorder;
  return getNodeBorder(getNodeAppearanceStyle(node), defaultBorder);
};

export const getNodeGradientValue = (node: Node | undefined, settings: TranslationSettings) =>
  getNodeGradient(getNodeAppearanceStyle(node), settings.nodeGradient);

export const getNodeShadowValueForNode = (node: Node | undefined, settings: TranslationSettings) =>
  getNodeShadowValue(getNodeAppearanceStyle(node), settings.nodeShadow);

export const getNodeSurfaceValue = (node: Node | undefined, settings: TranslationSettings) => {
  const style = getNodeAppearanceStyle(node);
  const customFill = node?.data?.fill || style?.backgroundColor;
  const defaultSurface = getSequenceNodeDefaults(node)?.surface || settings.nodeSurface;
  const surface = customFill ? 'solid' : defaultSurface;
  return getNodeSurface(style, surface);
};

export const getNodeShapeValue = (node: Node | undefined, settings: TranslationSettings) =>
  getNodeShape(getNodeAppearanceStyle(node), settings.nodeShape);

export const getEdgeColorValue = (edge: Edge | undefined, settings: TranslationSettings) => {
  return getColorValue(edge?.style?.stroke, settings.edgeColor);
};

export const getEdgeWidthValue = (edge: Edge | undefined, settings: TranslationSettings) => {
  const width = getNumberValue(edge?.style?.strokeWidth, settings.edgeWidth);
  return clampEdgeWidth(width);
};

export const getEdgeMarkerValue = (
  edge: Edge | undefined,
  settings: TranslationSettings,
): EdgeMarkerValue => {
  if (!edge) {
    return settings.edgeMarker;
  }

  const isSequenceSourceSegment =
    edge.data?.kind === SEQUENCE_MESSAGE_KIND && edge.data?.segment === 'source';
  const marker = isSequenceSourceSegment ? edge.markerStart : edge.markerEnd;
  if (typeof marker !== 'object') {
    return 'none';
  }

  const option = EDGE_MARKER_OPTIONS.find((item) => item.value === marker.type);
  return option?.value || 'none';
};

export const getEdgeTypeValue = (
  edge: Edge | undefined,
  settings: TranslationSettings,
): EdgeType => {
  if (edge?.type === undefined) {
    return settings.edgeType;
  }

  if (edge.type === SURGE_EDGE_TYPE) {
    const edgeType = edge.data?.edgeType;
    const option = EDGE_TYPE_OPTIONS.find((item) => item.value === edgeType);
    return option?.value || settings.edgeType;
  }

  if (edge.type === SEQUENCE_MESSAGE_EDGE_TYPE) {
    const edgeType = edge.data?.edgeType;
    const option = EDGE_TYPE_OPTIONS.find((item) => item.value === edgeType);
    return option?.value || settings.edgeType;
  }

  const option = EDGE_TYPE_OPTIONS.find((item) => item.value === edge.type);

  return option?.value || settings.edgeType;
};

export const getEdgeAnimationValue = (
  edge: Edge | undefined,
  settings: TranslationSettings,
): EdgeAnimation => {
  if (!edge) return settings.edgeAnimation;
  if (edge.type === SURGE_EDGE_TYPE) {
    return 'surge';
  }
  if (edge?.animated) {
    return 'flow';
  }

  if (edge?.className === 'animate-pulse') {
    return 'pulse';
  }

  return 'none';
};

const getNodeWidth = (node: Node) => {
  return node.width || 150;
};

const getNodeHeight = (node: Node) => {
  return node.height || 40;
};

const getNodeCenter = (node: Node) => {
  const xOffset = getNodeWidth(node) / 2;
  const yOffset = getNodeHeight(node) / 2;
  const x = node.position.x + xOffset;
  const y = node.position.y + yOffset;

  return { x, y };
};

export const getEdgeAnchor = (edge: Edge, nodes: Node[]) => {
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);

  if (!source) {
    return null;
  }

  if (!target) {
    return null;
  }

  const sourceCenter = getNodeCenter(source);
  const targetCenter = getNodeCenter(target);
  const x = (sourceCenter.x + targetCenter.x) / 2;
  const messageY = edge.data?.messageY;
  if (typeof messageY === 'number') return { x, y: messageY };
  const y = (sourceCenter.y + targetCenter.y) / 2;

  return { x, y };
};

export const applySettings = (
  elements: GraphElements,
  settings: Partial<TranslationSettings>,
): GraphElements => {
  const nodes = elements.nodes.map((node) => {
    return applyNodeStyle(node, createNodeStyleUpdate(node, settings));
  });
  const edges = elements.edges.map((edge) => createEdgeUpdate(edge, settings));

  return { nodes, edges };
};

const hydrateElementSettings = (
  elements: GraphElements,
  settings: TranslationSettings,
): GraphElements => {
  const nodes = elements.nodes.map((node) => {
    const hasSourceStyle =
      SEQUENCE_NODE_KINDS.has(node.data?.kind) ||
      ['class-node', 'er-node', 'gantt-task', 'gantt-frame'].includes(node.data?.kind);
    const defaults = hasSourceStyle ? {} : createNodeStyle(settings);
    const combinedStyle = Object.assign({}, defaults, getNodeAppearanceStyle(node));
    const style = normalizeNodeStyle(combinedStyle, settings);

    return applyNodeStyle(node, style);
  });
  const edges = elements.edges.map((edge) => {
    const strokeWidth = getEdgeWidthValue(edge, settings);
    const style = Object.assign({}, createEdgeStyle(settings), edge.style, { strokeWidth });
    const color = getColorValue(style.stroke, settings.edgeColor);
    const markerEnd = colorEdgeMarker(edge.markerEnd, color);
    const markerStart = colorEdgeMarker(edge.markerStart, color);
    const hasAnimation = edge.animated !== undefined || edge.className !== undefined;
    const defaultClassName = hasAnimation ? '' : getEdgeAnimationClassName(settings);
    const isSurge = edge.type === SURGE_EDGE_TYPE;
    const edgeType = getEdgeTypeValue(edge, settings);
    const data = isSurge ? Object.assign({}, edge.data, { edgeType }) : edge.data;

    return Object.assign({}, edge, {
      animated: edge.animated ?? getEdgeAnimated(settings),
      className: edge.className ?? defaultClassName,
      markerEnd,
      markerStart,
      style,
      type: edge.type ?? edgeType,
      data,
    });
  });

  return { nodes, edges };
};

const getSettings = (settings: Partial<TranslationSettings>): TranslationSettings => {
  const edgeWidth = clampEdgeWidth(settings.edgeWidth ?? DEFAULT_SETTINGS.edgeWidth);
  return Object.assign({}, DEFAULT_SETTINGS, settings, { edgeWidth });
};

const normalizeNodeStyle = (style: CSSProperties, settings: TranslationSettings) => {
  const legacyBorder = getNodeStyleValue(style, 'border');
  if (legacyBorder === undefined) return style;
  const normalized = Object.assign({}, style) as CSSProperties & Record<string, unknown>;
  normalized.borderColor =
    normalized.borderColor || getColorValue(style.backgroundColor, settings.primaryColor);
  delete normalized.border;
  return normalized;
};

export const getTranslation = (translation: GraphTranslation): GraphTranslation => {
  const settings = getSettings(translation.settings);
  const hydrated = hydrateElementSettings(translation.elements, settings);
  const { selection, ...view } = translation.view;
  const nodeIds = new Set(selection?.nodeIds);
  const edgeIds = new Set(selection?.edgeIds);
  const nodes = hydrated.nodes.map((node) => {
    const selected = node.selected ?? nodeIds.has(node.id);
    return Object.assign({}, node, { selected });
  });
  const edges = hydrated.edges.map((edge) => {
    const selected = edge.selected ?? edgeIds.has(edge.id);
    return Object.assign({}, edge, { selected });
  });
  return Object.assign({}, translation, {
    diagramType: translation.diagramType || 'flowchart',
    elements: { nodes, edges },
    settings,
    view,
  });
};

const restoreEdgeData = (edge: Edge, saved: Edge) => {
  if (edge.data?.kind !== SEQUENCE_MESSAGE_KIND) return saved.data;
  const edgeType = saved.data?.edgeType;
  if (edgeType === undefined) return edge.data;
  return Object.assign({}, edge.data, { edgeType });
};

const restoreEdgeMarker = (edge: Edge, saved: Edge, key: 'markerStart' | 'markerEnd') => {
  const isSequence = edge.data?.kind === SEQUENCE_MESSAGE_KIND;
  const hasChangedMarker = isSequence && edge.data?.[key] !== saved.data?.[key];
  if (!hasChangedMarker) return saved[key];
  const color = getColorValue(saved.style?.stroke, DEFAULT_SETTINGS.edgeColor);
  return colorEdgeMarker(edge[key], color);
};

const restoreEdgeAppearance = (edge: Edge, savedEdges: Map<string, Edge>) => {
  const saved = savedEdges.get(edge.id);
  if (!saved) return edge;
  const sameEndpoints = saved.source === edge.source && saved.target === edge.target;
  if (!sameEndpoints) return edge;
  const hasSemanticMarkers = ['class-relation', 'er-relation'].includes(edge.data?.kind);
  if (hasSemanticMarkers) {
    return Object.assign({}, edge, { style: saved.style, selected: saved.selected });
  }
  if (edge.data?.kind === 'state-transition') {
    const color = getColorValue(saved.style?.stroke, DEFAULT_SETTINGS.edgeColor);
    const markerEnd = edge.data.arrow ? createEdgeMarker('arrowclosed', color) : undefined;
    return Object.assign({}, edge, { markerEnd, style: saved.style, selected: saved.selected });
  }
  const data = restoreEdgeData(edge, saved);
  const markerEnd = restoreEdgeMarker(edge, saved, 'markerEnd');
  const markerStart = restoreEdgeMarker(edge, saved, 'markerStart');
  return Object.assign({}, edge, {
    animated: saved.animated,
    className: saved.className,
    markerEnd,
    markerStart,
    selected: saved.selected,
    style: saved.style,
    type: saved.type,
    data,
  });
};

export const applySavedAppearance = (
  elements: GraphElements,
  savedElements: GraphElements,
  resetLayout = false,
): GraphElements => {
  const entries = savedElements.nodes.map((node) => [node.id, node] as const);
  const savedNodes = new Map(entries);
  const edgeEntries = savedElements.edges.map((edge) => [edge.id, edge] as const);
  const savedEdges = new Map(edgeEntries);
  const nodes = elements.nodes.map((node) => {
    const saved = savedNodes.get(node.id);
    if (!saved) return node;
    if (node.data?.kind === 'gantt-frame') return node;
    if (node.data?.kind === 'gantt-task') {
      const ambiguous = node.data.ambiguousIdentity || saved.data?.ambiguousIdentity;
      const changedStatus = node.data.status !== saved.data?.status;
      const resetAppearance = ambiguous || changedStatus;
      if (resetAppearance) return node;
      const selected = saved.selected;
      return applyNodeStyle(Object.assign({}, node, { selected }), getNodeAppearanceStyle(saved));
    }
    const { selected } = saved;
    const style = getNodeAppearanceStyle(saved);
    const isLegacySequence =
      SEQUENCE_NODE_KINDS.has(saved.data?.kind) && saved.data.styleVersion !== 1;
    const changedStateShape =
      node.data?.kind === 'state-node' && node.data.shape !== saved.data?.shape;
    if (changedStateShape) return node;
    const changedParent = node.parentId !== saved.parentId;
    const useFreshLayout = resetLayout || isLegacySequence || changedParent;
    const position = useFreshLayout ? node.position : saved.position;
    return applyNodeStyle(Object.assign({}, node, { position, selected }), style);
  });
  const edges = elements.edges.map((edge) => restoreEdgeAppearance(edge, savedEdges));
  return { nodes, edges };
};
