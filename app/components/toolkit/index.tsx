'use client';

import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/app/components/ui/field';
import { Input } from '@/app/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Slider } from '@/app/components/ui/slider';
import { Switch } from '@/app/components/ui/switch';
import {
  EDGE_ANIMATION_OPTIONS,
  EDGE_MARKER_OPTIONS,
  EDGE_TYPE_OPTIONS,
  EDGE_WIDTH_LIMITS,
  CANVAS_BACKGROUND_OPTIONS,
  GRADIENT_DIRECTION_OPTIONS,
  NODE_BORDER_OPTIONS,
  NODE_SHAPE_OPTIONS,
  NODE_SHADOW_OPTIONS,
  NODE_SURFACE_OPTIONS,
  TOOLKIT_LABELS,
} from './constants';
import type { GraphGradientSettings, GraphPatternSettings } from '@/app/graph';
import type {
  CanvasToolProps,
  EdgeToolProps,
  GradientFieldsProps,
  GradientToolsProps,
  NodeToolProps,
  PatternToolsProps,
  PatternFieldsProps,
  ShaderColorFieldProps,
  ShaderToolsProps,
} from './types';
import { createShaderColorHandler, getPatternPreviewStyle, isPatternBackground } from './utils';

export const NodeTools = (props: NodeToolProps) => {
  const showDetails = !props.fillOnly;
  const showGradient = showDetails && props.surfaceValue === 'gradient';
  return (
    <FieldSet className="gap-2">
      <FieldLegend className="mb-1 font-semibold" variant="label">
        {TOOLKIT_LABELS.nodes}
      </FieldLegend>
      <FieldGroup className="grid grid-cols-12 gap-x-3 gap-y-3">
        <NodeFill {...props} />
        {showDetails && <NodeText {...props} />}
        {showDetails && <NodeBorder {...props} />}
        {showDetails && <NodeShadow {...props} />}
        {!props.preserveSemantics && <NodeShape {...props} />}
        {showDetails && <NodeSurface {...props} />}
        {showGradient ? (
          <GradientTools
            gradient={props.gradient}
            idPrefix="node"
            onUpdate={props.onGradientUpdate}
          />
        ) : null}
      </FieldGroup>
    </FieldSet>
  );
};

export const EdgeTools = (props: EdgeToolProps) => {
  return (
    <FieldSet className="gap-2">
      <FieldLegend className="mb-1 font-semibold" variant="label">
        {TOOLKIT_LABELS.edges}
      </FieldLegend>
      <FieldGroup className="@container-normal grid grid-cols-12 gap-x-3 gap-y-3">
        {!props.preserveSemantics && <EdgeType {...props} />}
        {!props.preserveSemantics && <EdgeMarker {...props} />}
        {!props.preserveSemantics && <EdgeAnimation {...props} />}
        <EdgeColor {...props} />
        <EdgeWidth {...props} />
      </FieldGroup>
    </FieldSet>
  );
};

export const CanvasTools = (props: CanvasToolProps) => {
  return (
    <FieldSet className="gap-2">
      <FieldLegend className="mb-1 font-semibold" variant="label">
        {TOOLKIT_LABELS.canvas}
      </FieldLegend>
      <FieldGroup className="grid grid-cols-12 gap-x-3 gap-y-3">
        <CanvasBackgroundField {...props} />
        <CanvasBackgroundSettings {...props} />
        <CanvasGrid {...props} />
        <CanvasSnap {...props} />
        <CanvasLock {...props} />
      </FieldGroup>
    </FieldSet>
  );
};

const NodeFill = (props: NodeToolProps) => {
  return (
    <Field className="col-span-3 min-w-0 gap-1">
      <FieldLabel className="text-xs" htmlFor="node-fill">
        {TOOLKIT_LABELS.fill}
      </FieldLabel>
      <Input
        className="h-8 cursor-pointer p-0.5"
        id="node-fill"
        type="color"
        value={props.fillValue}
        onChange={props.onFillUpdate}
      />
    </Field>
  );
};

const NodeText = (props: NodeToolProps) => {
  return (
    <Field className="col-span-3 min-w-0 gap-1">
      <FieldLabel className="text-xs" htmlFor="node-text">
        {TOOLKIT_LABELS.text}
      </FieldLabel>
      <Input
        className="h-8 cursor-pointer p-0.5"
        id="node-text"
        type="color"
        value={props.textValue}
        onChange={props.onTextUpdate}
      />
    </Field>
  );
};

const NodeBorder = (props: NodeToolProps) => {
  const borders = NODE_BORDER_OPTIONS.map((option) => (
    <SelectItem key={option.value} value={option.value}>
      {option.label}
    </SelectItem>
  ));
  return (
    <Field className="col-span-6 min-w-0 gap-1">
      <FieldLabel className="text-xs" htmlFor="node-border">
        {TOOLKIT_LABELS.border}
      </FieldLabel>
      <Select onValueChange={props.onBorderUpdate} value={props.borderValue}>
        <SelectTrigger className="h-8 px-2 text-xs" id="node-border">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{borders}</SelectContent>
      </Select>
    </Field>
  );
};

const NodeShadow = (props: NodeToolProps) => {
  const shadows = NODE_SHADOW_OPTIONS.map((option) => (
    <SelectItem key={option.value} value={option.value}>
      {option.label}
    </SelectItem>
  ));
  return (
    <Field className="col-span-6 min-w-0 gap-1">
      <FieldLabel className="text-xs" htmlFor="node-shadow">
        {TOOLKIT_LABELS.shadow}
      </FieldLabel>
      <Select onValueChange={props.onShadowUpdate} value={props.shadowValue}>
        <SelectTrigger className="h-8 px-2 text-xs" id="node-shadow">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{shadows}</SelectContent>
      </Select>
    </Field>
  );
};

const NodeShape = (props: NodeToolProps) => {
  const shapes = NODE_SHAPE_OPTIONS.map((option) => (
    <SelectItem key={option.value} value={option.value}>
      {option.label}
    </SelectItem>
  ));
  return (
    <Field className="col-span-6 min-w-0 gap-1">
      <FieldLabel className="text-xs" htmlFor="node-shape">
        {TOOLKIT_LABELS.shape}
      </FieldLabel>
      <Select onValueChange={props.onShapeUpdate} value={props.shapeValue}>
        <SelectTrigger className="h-8 px-2 text-xs" id="node-shape">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{shapes}</SelectContent>
      </Select>
    </Field>
  );
};

const NodeSurface = (props: NodeToolProps) => {
  const surfaces = NODE_SURFACE_OPTIONS.map((option) => (
    <SelectItem key={option.value} value={option.value}>
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="size-4 shrink-0 rounded-sm border"
          style={getPatternPreviewStyle(option.value, option.preview)}
        />
        {option.label}
      </span>
    </SelectItem>
  ));
  return (
    <Field className="col-span-6 min-w-0 gap-1">
      <FieldLabel className="text-xs" htmlFor="node-surface">
        {TOOLKIT_LABELS.surface}
      </FieldLabel>
      <Select onValueChange={props.onSurfaceUpdate} value={props.surfaceValue}>
        <SelectTrigger className="h-8 px-2 text-xs" id="node-surface">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{surfaces}</SelectContent>
      </Select>
    </Field>
  );
};

const EdgeType = (props: EdgeToolProps) => {
  const types = EDGE_TYPE_OPTIONS.map((option) => (
    <SelectItem key={option.value} value={option.value}>
      {option.label}
    </SelectItem>
  ));
  return (
    <Field className="col-span-6 min-w-0 gap-1">
      <FieldLabel className="text-xs" htmlFor="edge-type">
        {TOOLKIT_LABELS.type}
      </FieldLabel>
      <Select onValueChange={props.onTypeUpdate} value={props.typeValue}>
        <SelectTrigger
          className="h-8 gap-1 px-2 text-xs [&>span]:min-w-0 [&>svg]:shrink-0"
          id="edge-type"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="w-max whitespace-nowrap">{types}</SelectContent>
      </Select>
    </Field>
  );
};

const EdgeMarker = (props: EdgeToolProps) => {
  const markers = EDGE_MARKER_OPTIONS.map((option) => (
    <SelectItem key={option.value} value={option.value}>
      {option.label}
    </SelectItem>
  ));
  return (
    <Field className="col-span-6 min-w-0 gap-1">
      <FieldLabel className="text-xs" htmlFor="edge-marker">
        {TOOLKIT_LABELS.marker}
      </FieldLabel>
      <Select onValueChange={props.onMarkerUpdate} value={props.markerValue}>
        <SelectTrigger
          className="h-8 gap-1 px-2 text-xs [&>span]:min-w-0 [&>svg]:shrink-0"
          id="edge-marker"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="w-max whitespace-nowrap">{markers}</SelectContent>
      </Select>
    </Field>
  );
};

const EdgeAnimation = (props: EdgeToolProps) => {
  const animations = EDGE_ANIMATION_OPTIONS.map((option) => (
    <SelectItem key={option.value} value={option.value}>
      {option.label}
    </SelectItem>
  ));
  return (
    <Field className="col-span-6 min-w-0 gap-1">
      <FieldLabel className="text-xs" htmlFor="edge-animation">
        {TOOLKIT_LABELS.animation}
      </FieldLabel>
      <Select onValueChange={props.onAnimationUpdate} value={props.animationValue}>
        <SelectTrigger
          className="h-8 gap-1 px-2 text-xs [&>span]:min-w-0 [&>svg]:shrink-0"
          id="edge-animation"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="w-max whitespace-nowrap">{animations}</SelectContent>
      </Select>
    </Field>
  );
};

const EdgeColor = (props: EdgeToolProps) => {
  return (
    <Field className="col-span-3 min-w-0 gap-1">
      <FieldLabel className="text-xs" htmlFor="edge-color">
        {TOOLKIT_LABELS.color}
      </FieldLabel>
      <Input
        className="h-8 cursor-pointer p-0.5"
        id="edge-color"
        onChange={props.onColorUpdate}
        type="color"
        value={props.colorValue}
      />
    </Field>
  );
};

const EdgeWidth = (props: EdgeToolProps) => {
  return (
    <Field className="col-span-3 min-w-0 gap-1">
      <FieldLabel className="text-xs" htmlFor="edge-width" id="edge-width-label">
        {TOOLKIT_LABELS.width}
      </FieldLabel>
      <Input
        className="h-8 px-2 text-xs"
        id="edge-width"
        max={EDGE_WIDTH_LIMITS.maximum}
        min={EDGE_WIDTH_LIMITS.minimum}
        onChange={props.onWidthUpdate}
        step={1}
        type="number"
        value={props.widthValue}
      />
    </Field>
  );
};

const CanvasBackgroundField = (props: CanvasToolProps) => {
  const backgrounds = CANVAS_BACKGROUND_OPTIONS.map((option) => (
    <SelectItem key={option.value} value={option.value}>
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="size-4 shrink-0 rounded-sm border"
          style={getPatternPreviewStyle(option.value, option.preview)}
        />
        {option.label}
      </span>
    </SelectItem>
  ));
  return (
    <Field className="col-span-6 min-w-0 gap-1">
      <FieldLabel className="text-xs" htmlFor="canvas-background">
        {TOOLKIT_LABELS.background}
      </FieldLabel>
      <Select onValueChange={props.onBackgroundUpdate} value={props.settings.background}>
        <SelectTrigger className="h-8 px-2 text-xs" id="canvas-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{backgrounds}</SelectContent>
      </Select>
    </Field>
  );
};

const CanvasGrid = (props: CanvasToolProps) => {
  const toggleClassName = isPatternBackground(props.settings.background)
    ? 'col-span-6'
    : 'col-span-4';
  return (
    <Field className={toggleClassName} orientation="horizontal">
      <FieldLabel className="text-xs" htmlFor="canvas-grid">
        {TOOLKIT_LABELS.grid}
      </FieldLabel>
      <Switch
        checked={props.settings.gridVisible}
        id="canvas-grid"
        onCheckedChange={props.onGridUpdate}
      />
    </Field>
  );
};

const CanvasSnap = (props: CanvasToolProps) => {
  const toggleClassName = isPatternBackground(props.settings.background)
    ? 'col-span-6'
    : 'col-span-4';
  return (
    <Field className={toggleClassName} orientation="horizontal">
      <FieldLabel className="text-xs" htmlFor="canvas-snap">
        {TOOLKIT_LABELS.snap}
      </FieldLabel>
      <Switch
        checked={props.settings.snapToGrid}
        id="canvas-snap"
        onCheckedChange={props.onSnapUpdate}
      />
    </Field>
  );
};

const CanvasLock = (props: CanvasToolProps) => {
  const toggleClassName = isPatternBackground(props.settings.background)
    ? 'col-span-6'
    : 'col-span-4';
  return (
    <Field className={toggleClassName} orientation="horizontal">
      <FieldLabel className="text-xs" htmlFor="canvas-lock">
        {TOOLKIT_LABELS.lock}
      </FieldLabel>
      <Switch
        checked={props.settings.locked}
        id="canvas-lock"
        onCheckedChange={props.onLockUpdate}
        title={TOOLKIT_LABELS.lockDescription}
      />
    </Field>
  );
};

const CanvasBackgroundSettings = (props: CanvasToolProps) => {
  const isAuroraBackground = props.settings.background === 'aurora';
  const isMeshBackground = props.settings.background === 'gradient-mesh';
  const isShaderBackground = isAuroraBackground || isMeshBackground;
  const showPattern = isPatternBackground(props.settings.background);

  return (
    <>
      {props.settings.background === 'gradient' ? (
        <GradientTools
          gradient={props.gradient}
          idPrefix="canvas"
          onUpdate={props.onGradientUpdate}
        />
      ) : null}
      {isShaderBackground ? (
        <ShaderTools
          background={props.settings.background}
          onUpdate={props.onShaderUpdate}
          shader={props.shader}
        />
      ) : null}
      {showPattern ? (
        <PatternTools idPrefix="canvas" onUpdate={props.onPatternUpdate} pattern={props.pattern} />
      ) : null}
    </>
  );
};

const GradientTools = ({ gradient, idPrefix, onUpdate }: GradientToolsProps) => {
  const updateGradient = (update: Partial<GraphGradientSettings>) => {
    onUpdate(Object.assign({}, gradient, update));
  };
  const fields = { gradient, idPrefix, updateGradient };
  return (
    <>
      <GradientColors {...fields} />
      <GradientDirection {...fields} />
      <GradientBalance {...fields} />
    </>
  );
};

const GradientColors = ({ gradient, idPrefix, updateGradient }: GradientFieldsProps) => {
  const colorAId = `${idPrefix}-gradient-color-a`;
  const colorBId = `${idPrefix}-gradient-color-b`;
  return (
    <>
      <Field className="col-span-3 min-w-0 gap-1">
        <FieldLabel className="text-xs" htmlFor={colorAId}>
          {TOOLKIT_LABELS.gradientColorA}
        </FieldLabel>
        <Input
          className="h-8 cursor-pointer p-0.5"
          id={colorAId}
          type="color"
          value={gradient.colorA}
          onChange={(event) => updateGradient({ colorA: event.target.value })}
        />
      </Field>
      <Field className="col-span-3 min-w-0 gap-1">
        <FieldLabel className="text-xs" htmlFor={colorBId}>
          {TOOLKIT_LABELS.gradientColorB}
        </FieldLabel>
        <Input
          className="h-8 cursor-pointer p-0.5"
          id={colorBId}
          type="color"
          value={gradient.colorB}
          onChange={(event) => updateGradient({ colorB: event.target.value })}
        />
      </Field>
    </>
  );
};

const GradientDirection = ({ gradient, idPrefix, updateGradient }: GradientFieldsProps) => {
  const directionId = `${idPrefix}-gradient-direction`;
  const handleDirectionUpdate = (value: string) => {
    const option = GRADIENT_DIRECTION_OPTIONS.find((item) => item.value === value);
    if (option) updateGradient({ direction: option.value });
  };
  return (
    <Field className="col-span-6 min-w-0 gap-1">
      <FieldLabel className="text-xs" htmlFor={directionId}>
        {TOOLKIT_LABELS.gradientDirection}
      </FieldLabel>
      <Select onValueChange={handleDirectionUpdate} value={gradient.direction}>
        <SelectTrigger className="h-8 px-2 text-xs" id={directionId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GRADIENT_DIRECTION_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
};

const GradientBalance = ({ gradient, idPrefix, updateGradient }: GradientFieldsProps) => {
  const split = Math.min(100, Math.max(0, gradient.split));
  const balanceId = `${idPrefix}-gradient-balance`;
  const handleSplitUpdate = (values: number[]) => {
    const [nextSplit] = values;
    if (nextSplit !== undefined) updateGradient({ split: nextSplit });
  };
  return (
    <Field className="col-span-6 min-w-0 gap-1">
      <FieldLabel className="justify-between text-xs" htmlFor={balanceId}>
        <span>{TOOLKIT_LABELS.gradientBalance}</span>
        <span className="text-muted-foreground">
          {split}% / {100 - split}%
        </span>
      </FieldLabel>
      <Slider
        aria-label={TOOLKIT_LABELS.gradientBalance}
        id={balanceId}
        max={100}
        min={0}
        onValueChange={handleSplitUpdate}
        step={1}
        value={[split]}
      />
    </Field>
  );
};

const PatternTools = ({ idPrefix, onUpdate, pattern }: PatternToolsProps) => {
  const updatePattern = (update: Partial<GraphPatternSettings>) => {
    onUpdate(Object.assign({}, pattern, update));
  };
  const fields = { idPrefix, pattern, updatePattern };
  return (
    <>
      <PatternColors {...fields} />
      <PatternDensity {...fields} />
    </>
  );
};

const PatternColors = ({ idPrefix, pattern, updatePattern }: PatternFieldsProps) => {
  const colorId = `${idPrefix}-pattern-color`;
  const backgroundColorId = `${idPrefix}-pattern-background-color`;
  return (
    <>
      <Field className="col-span-3 min-w-0 gap-1">
        <FieldLabel className="text-xs" htmlFor={colorId}>
          {TOOLKIT_LABELS.patternColor}
        </FieldLabel>
        <Input
          className="h-8 cursor-pointer p-0.5"
          id={colorId}
          type="color"
          value={pattern.color}
          onChange={(event) => updatePattern({ color: event.target.value })}
        />
      </Field>
      <Field className="col-span-3 min-w-0 gap-1">
        <FieldLabel className="text-xs" htmlFor={backgroundColorId}>
          {TOOLKIT_LABELS.patternBackgroundColor}
        </FieldLabel>
        <Input
          className="h-8 cursor-pointer p-0.5"
          id={backgroundColorId}
          type="color"
          value={pattern.backgroundColor}
          onChange={(event) => updatePattern({ backgroundColor: event.target.value })}
        />
      </Field>
    </>
  );
};

const PatternDensity = ({ idPrefix, pattern, updatePattern }: PatternFieldsProps) => {
  const densityId = `${idPrefix}-pattern-density`;
  const density = Math.min(100, Math.max(0, pattern.density));
  return (
    <Field className="col-span-6 min-w-0 gap-1">
      <FieldLabel className="justify-between text-xs" htmlFor={densityId}>
        <span>{TOOLKIT_LABELS.patternDensity}</span>
        <span className="text-muted-foreground">{density}%</span>
      </FieldLabel>
      <Slider
        aria-label={TOOLKIT_LABELS.patternDensity}
        id={densityId}
        max={100}
        min={0}
        onValueChange={(values) => {
          const [nextDensity] = values;
          if (nextDensity !== undefined) updatePattern({ density: nextDensity });
        }}
        step={1}
        value={[density]}
      />
    </Field>
  );
};

const ShaderTools = ({ background, onUpdate, shader }: ShaderToolsProps) => {
  const isAurora = background === 'aurora';
  const colors = isAurora ? shader.aurora : shader.gradientMesh;
  const handleColorAUpdate = createShaderColorHandler(shader, isAurora, 'colorA', onUpdate);
  const handleColorBUpdate = createShaderColorHandler(shader, isAurora, 'colorB', onUpdate);
  const handleColorCUpdate = createShaderColorHandler(shader, isAurora, 'colorC', onUpdate);
  const colorCField = isAurora ? (
    <ShaderColorField
      id="canvas-shader-color-c"
      label={TOOLKIT_LABELS.shaderColorC}
      onChange={handleColorCUpdate}
      value={shader.aurora.colorC}
    />
  ) : null;

  return (
    <>
      <ShaderColorField
        id="canvas-shader-color-a"
        label={TOOLKIT_LABELS.shaderColorA}
        onChange={handleColorAUpdate}
        value={colors.colorA}
      />
      <ShaderColorField
        id="canvas-shader-color-b"
        label={TOOLKIT_LABELS.shaderColorB}
        onChange={handleColorBUpdate}
        value={colors.colorB}
      />
      {colorCField}
    </>
  );
};

const ShaderColorField = ({ id, label, onChange, value }: ShaderColorFieldProps) => (
  <Field className="col-span-3 min-w-0 gap-1">
    <FieldLabel className="text-xs" htmlFor={id}>
      {label}
    </FieldLabel>
    <Input
      className="h-8 cursor-pointer p-0.5"
      id={id}
      type="color"
      value={value}
      onChange={onChange}
    />
  </Field>
);
