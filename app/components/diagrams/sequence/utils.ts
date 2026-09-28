import type { CSSProperties } from 'react';
import type { EdgeProps } from 'reactflow';
import { createDiagonalPatternImage } from '@/app/graph';
import { NODE_PATTERN_SIZE } from '@/app/graph/constants';
import type { SequenceFrameData } from '@/app/graph/types';

export const getHeaderStyle = (style: CSSProperties | undefined): CSSProperties => ({
  backgroundColor: style?.backgroundColor,
  backgroundImage: style?.backgroundImage,
  backgroundSize: style?.backgroundSize,
  borderColor: style?.borderColor,
  borderRadius: style?.borderRadius,
  borderStyle: style?.borderStyle,
  borderWidth: style?.borderWidth,
  boxShadow: style?.boxShadow,
  clipPath: style?.clipPath,
  color: style?.color,
  fontFamily: style?.fontFamily,
});

export const getMessagePath = (
  {
    sourceX,
    sourceY,
    targetX,
    targetY,
  }: Pick<EdgeProps, 'sourceX' | 'sourceY' | 'targetX' | 'targetY'>,
  selfMessage: boolean,
) => {
  if (!selfMessage) return `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
  const controlX = Math.max(sourceX, targetX) + 48;
  const midpointY = sourceY + (targetY - sourceY) / 2;
  return `M ${sourceX},${sourceY} C ${controlX},${sourceY} ${controlX},${midpointY} ${targetX},${targetY}`;
};

export const getFrameStyle = (data: SequenceFrameData): CSSProperties => {
  const pattern = createDiagonalPatternImage('var(--color-gray-200)', NODE_PATTERN_SIZE);
  const patternStyle = { '--sequence-pattern': pattern } as CSSProperties;
  const fillStyle = data.fill ? { backgroundColor: data.fill, backgroundImage: 'none' } : {};
  const hasCustomFill = data.style.backgroundColor !== undefined;
  const customBackground = hasCustomFill ? { backgroundImage: 'none' } : {};
  return Object.assign({}, patternStyle, fillStyle, customBackground, data.style);
};
