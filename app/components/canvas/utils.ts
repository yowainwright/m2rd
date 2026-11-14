import type { CSSProperties } from 'react';
import { createDiagonalPatternImage, createPolkaPinPatternImage } from '@/app/graph';
import type { CanvasBackground, GraphPatternSettings } from '@/app/graph';
import { PATTERN_MAX_SIZE, PATTERN_MIN_SIZE } from './constants';

export const getPatternStyle = (
  preset: CanvasBackground,
  pattern: GraphPatternSettings,
): CSSProperties => {
  const size = getPatternSize(pattern.density);
  const backgroundImage = getPatternImage(preset, pattern.color, size);
  const backgroundSize = getPatternBackgroundSize(preset, size);
  return { backgroundColor: pattern.backgroundColor, backgroundImage, backgroundSize };
};

export const getAuroraFallbackBackground = (colorA: string, colorB: string, colorC: string) => {
  return `radial-gradient(circle at 50% 0%, ${colorB} 0%, transparent 45%), linear-gradient(135deg, ${colorA} 0%, ${colorB} 50%, ${colorC} 100%)`;
};

export const getGradientMeshFallbackBackground = (colorA: string, colorB: string) => {
  return `radial-gradient(circle at 20% 20%, ${colorB} 0%, transparent 42%), radial-gradient(circle at 80% 70%, ${colorA} 0%, transparent 44%), linear-gradient(135deg, ${colorA} 0%, ${colorB} 100%)`;
};

const getPatternBackgroundSize = (preset: CanvasBackground, size: number) => {
  if (preset === 'pattern-diagonal') return 'auto';
  return `${size}px ${size}px`;
};

const getPatternImage = (preset: CanvasBackground, color: string, size: number) => {
  if (preset === 'grid') {
    return `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px)`;
  }

  if (preset === 'dot-pattern') {
    return `radial-gradient(${color} 1.5px, transparent 1.5px)`;
  }

  if (preset === 'pattern-diagonal') {
    return createDiagonalPatternImage(color, size);
  }

  if (preset === 'pattern-polka-pin') {
    return createPolkaPinPatternImage(color);
  }

  if (preset === 'pattern-checkerboard') {
    return `conic-gradient(${color} 25%, transparent 0 50%, ${color} 0 75%, transparent 0)`;
  }

  return `linear-gradient(45deg, transparent 42%, ${color} 42% 58%, transparent 58%), linear-gradient(-45deg, transparent 42%, ${color} 42% 58%, transparent 58%)`;
};

const getPatternSize = (density: number) => {
  const boundedDensity = Math.min(100, Math.max(0, density));
  const densityRatio = boundedDensity / 100;
  const sizeRange = PATTERN_MAX_SIZE - PATTERN_MIN_SIZE;
  const patternSize = PATTERN_MAX_SIZE - densityRatio * sizeRange;
  return Math.round(patternSize);
};
