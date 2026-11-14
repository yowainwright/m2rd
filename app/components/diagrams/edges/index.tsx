'use client';

import { motion } from 'motion/react';
import {
  BaseEdge,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
} from 'reactflow';
import type { EdgeType } from '@/app/graph';

type SurgeEdgeProps = EdgeProps<{ edgeType?: EdgeType }>;

export const SURGE_EDGE_TYPES = { surge: SurgeEdge };

export function SurgeEdge(props: SurgeEdgeProps) {
  const edgeType = props.data?.edgeType || 'default';
  const [path] = getSurgePath(edgeType, props);
  const baseStyle = Object.assign({}, props.style, { strokeOpacity: 0.32 });
  const surgeStyle = Object.assign({}, props.style, {
    pointerEvents: 'none',
    strokeDasharray: '10 20',
    strokeLinecap: 'round',
  });

  return (
    <>
      <BaseEdge
        id={props.id}
        interactionWidth={props.interactionWidth}
        markerEnd={props.markerEnd}
        markerStart={props.markerStart}
        path={path}
        style={baseStyle}
      />
      <motion.path
        animate={{ strokeDashoffset: -30 }}
        aria-hidden="true"
        className="react-flow__edge-path"
        d={path}
        initial={{ strokeDashoffset: 0 }}
        style={surgeStyle}
        transition={{ duration: 0.9, ease: 'linear', repeat: Infinity }}
      />
    </>
  );
}

function getSurgePath(edgeType: EdgeType, props: SurgeEdgeProps) {
  const { sourcePosition, sourceX, sourceY, targetPosition, targetX, targetY } = props;
  if (edgeType === 'straight') {
    return getStraightPath({ sourceX, sourceY, targetX, targetY });
  }

  if (edgeType === 'step') {
    return getSmoothStepPath({
      borderRadius: 0,
      sourcePosition,
      sourceX,
      sourceY,
      targetPosition,
      targetX,
      targetY,
    });
  }

  if (edgeType === 'smoothstep') {
    return getSmoothStepPath({
      sourcePosition,
      sourceX,
      sourceY,
      targetPosition,
      targetX,
      targetY,
    });
  }

  return getBezierPath({
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX,
    targetY,
  });
}
