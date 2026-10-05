export {
  CANVAS_BACKGROUND_OPTIONS,
  CANVAS_GRID,
  DEFAULT_CANVAS_SETTINGS,
  EDGE_ANIMATION_OPTIONS,
  EDGE_MARKER_OPTIONS,
  EDGE_TYPE_OPTIONS,
  EDGE_WIDTH_LIMITS,
  NODE_BORDER_OPTIONS,
  NODE_SHADOW_OPTIONS,
  NODE_SHAPE_OPTIONS,
  NODE_SURFACE_OPTIONS,
  GRADIENT_DIRECTION_OPTIONS,
} from '@/app/graph/constants';

export const TOOLKIT_LABELS = {
  title: 'Graph toolkit',
  trigger: 'adj diagram',
  nodes: 'Nodes',
  fill: 'Fill',
  gradientColorA: 'Color A',
  gradientColorB: 'Color B',
  gradientDirection: 'Direction',
  gradientBalance: 'Color balance',
  patternColor: 'Pattern',
  patternBackgroundColor: 'Background',
  patternDensity: 'Density',
  shaderColorA: 'Color A',
  shaderColorB: 'Color B',
  shaderColorC: 'Color C',
  border: 'Border',
  shape: 'Shape',
  shadow: 'Shadow',
  surface: 'Surface',
  text: 'Text',
  edges: 'Edges',
  type: 'Type',
  marker: 'Marker',
  animation: 'Animation',
  width: 'Width',
  color: 'Color',
  canvas: 'Canvas',
  background: 'Background',
  grid: 'Show grid',
  snap: 'Snap to grid',
  lock: 'Lock canvas',
  lockDescription: 'Prevent canvas edits; keep pan and zoom',
};

export const TOOLKIT_METADATA_LABELS = {
  name: 'Name',
  version: 'Version',
  saved: 'Saved',
  nodes: 'Nodes',
  edges: 'Edges',
  label: 'Label',
  id: 'ID',
  from: 'From',
  to: 'To',
  unsaved: 'Not saved',
  unlabeled: 'No label',
};

export const TOOLKIT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

export const METADATA_BADGE_CLASS_NAME = 'px-2 py-0 text-xs';
export const TITLE_TOOLTIP_MAX_LENGTH = 24;
