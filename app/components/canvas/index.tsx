'use client';

import { Aurora, MeshGradient, Shader } from 'shaders/react';
import { createGradientImage } from '@/app/graph';
import { DEFAULT_CANVAS_SETTINGS } from '@/app/graph/constants';
import { cn } from '@/app/lib/utils';
import {
  AURORA_SETTINGS,
  CANVAS_BACKGROUND_CLASS_NAME,
  GRADIENT_MESH_SETTINGS,
  SHADER_BACKGROUND_CLASS_NAME,
  SHADER_CONTAINER_CLASS_NAME,
  SHADER_LAYER_CLASS_NAME,
} from './constants';
import type {
  AuroraLayerProps,
  AuroraShadersProps,
  CanvasBackgroundProps,
  GradientMeshLayerProps,
  GradientMeshShadersProps,
} from './types';
import {
  getAuroraFallbackBackground,
  getGradientMeshFallbackBackground,
  getPatternStyle,
} from './utils';

export const CanvasBackground = ({ gradient, pattern, preset, shader }: CanvasBackgroundProps) => {
  if (preset === 'none') return null;

  if (preset === 'gradient') {
    const style = { backgroundImage: createGradientImage(gradient) };
    return <div className={CANVAS_BACKGROUND_CLASS_NAME} style={style} />;
  }

  if (preset === 'aurora') {
    return (
      <div className={CANVAS_BACKGROUND_CLASS_NAME}>
        <AuroraShaders className={SHADER_BACKGROUND_CLASS_NAME} {...shader.aurora} />
      </div>
    );
  }

  if (preset === 'gradient-mesh') {
    return (
      <div className={CANVAS_BACKGROUND_CLASS_NAME}>
        <GradientMeshShaders className={SHADER_BACKGROUND_CLASS_NAME} {...shader.gradientMesh} />
      </div>
    );
  }

  const style = getPatternStyle(preset, pattern);
  return <div className={CANVAS_BACKGROUND_CLASS_NAME} style={style} />;
};

const AuroraShaders = ({
  className,
  colorA = DEFAULT_CANVAS_SETTINGS.shader.aurora.colorA,
  colorB = DEFAULT_CANVAS_SETTINGS.shader.aurora.colorB,
  colorC = DEFAULT_CANVAS_SETTINGS.shader.aurora.colorC,
  style,
  ...props
}: AuroraShadersProps) => {
  const fallbackBackground = getAuroraFallbackBackground(colorA, colorB, colorC);
  const backgroundStyle = Object.assign({}, { backgroundImage: fallbackBackground }, style);
  const containerClassName = cn(SHADER_CONTAINER_CLASS_NAME, className);
  return (
    <div className={containerClassName} style={backgroundStyle} {...props}>
      <AuroraLayer colorA={colorA} colorB={colorB} colorC={colorC} />
    </div>
  );
};

const AuroraLayer = ({ colorA, colorB, colorC }: AuroraLayerProps) => (
  <Shader className={SHADER_LAYER_CLASS_NAME}>
    <Aurora {...AURORA_SETTINGS} colorA={colorA} colorB={colorB} colorC={colorC} />
  </Shader>
);

const GradientMeshShaders = ({
  className,
  colorA = DEFAULT_CANVAS_SETTINGS.shader.gradientMesh.colorA,
  colorB = DEFAULT_CANVAS_SETTINGS.shader.gradientMesh.colorB,
  style,
  ...props
}: GradientMeshShadersProps) => {
  const fallbackBackground = getGradientMeshFallbackBackground(colorA, colorB);
  const backgroundStyle = Object.assign({}, { backgroundImage: fallbackBackground }, style);
  const containerClassName = cn(SHADER_CONTAINER_CLASS_NAME, className);
  return (
    <div className={containerClassName} style={backgroundStyle} {...props}>
      <GradientMeshLayer colorA={colorA} colorB={colorB} />
    </div>
  );
};

const GradientMeshLayer = ({ colorA, colorB }: GradientMeshLayerProps) => (
  <Shader className={SHADER_LAYER_CLASS_NAME}>
    <MeshGradient {...GRADIENT_MESH_SETTINGS} colorA={colorA} colorB={colorB} />
  </Shader>
);
