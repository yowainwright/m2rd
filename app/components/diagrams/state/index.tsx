'use client';

import { useEffect, type CSSProperties } from 'react';
import {
  BaseEdge,
  Handle,
  useUpdateNodeInternals,
  type EdgeProps,
  type NodeProps,
} from 'reactflow';
import { Card } from '@/app/components/ui/card';
import { Separator } from '@/app/components/ui/separator';
import { STATE_GROUPS, STATE_HANDLE_STYLE, STATE_SYMBOLS } from '@/app/graph/state/constants';
import type { StateEdgeData, StateNodeData, StatePoint } from '@/app/graph/state/types';

export function StateDiagramNode({ id, data }: NodeProps<StateNodeData>) {
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => updateNodeInternals(id), [data.handles, id, updateNodeInternals]);
  const style = getStateSurface(data);
  return (
    <>
      <Card style={style} data-state-shape={data.shape}>
        <StateContent data={data} />
      </Card>
      <StateHandles data={data} />
    </>
  );
}

export function StateHandles({ data }: { data: Pick<StateNodeData, 'handles'> }) {
  return data.handles.map((handle) => {
    const style = Object.assign({}, STATE_HANDLE_STYLE, {
      left: handle.x,
      top: handle.y,
      right: 'auto',
      bottom: 'auto',
      transform: 'translate(-50%, -50%)',
    });
    return (
      <Handle
        key={handle.id}
        id={handle.id}
        type={handle.type}
        position={handle.position}
        style={style}
        isConnectable={false}
      />
    );
  });
}

export function StateTransitionEdge(props: EdgeProps<StateEdgeData>) {
  const route = getStateEdgePath(props);
  const strokeDasharray = props.data?.dashed ? '5 4' : undefined;
  const markerEnd = props.data?.arrow ? props.markerEnd : undefined;
  const style = Object.assign({}, props.style, { strokeDasharray });
  return (
    <BaseEdge
      id={props.id}
      {...route}
      label={props.label}
      markerEnd={markerEnd}
      style={style}
      interactionWidth={props.interactionWidth}
      labelStyle={props.labelStyle}
      labelShowBg
    />
  );
}

export const getStateSurface = (data: StateNodeData): CSSProperties => {
  const style = getStateAppearance(data);
  if (STATE_SYMBOLS.has(data.shape))
    return {
      color: style.backgroundColor,
      width: '100%',
      height: '100%',
      border: 0,
      background: 'transparent',
      boxShadow: 'none',
    };
  if (data.shape === 'noteGroup')
    return {
      width: '100%',
      height: '100%',
      border: 0,
      background: 'transparent',
      boxShadow: 'none',
    };
  const isRegion = data.shape === 'divider';
  const isComposite = data.shape === 'roundedWithTitle';
  const borderStyle = isRegion ? 'dashed' : style.borderStyle;
  const borderWidth = isRegion || isComposite ? 1 : style.borderWidth;
  return Object.assign({}, style, { borderRadius: 6, borderStyle, borderWidth });
};

export const getStateEdgePath = <T extends Pick<StateEdgeData, 'points'>>(props: EdgeProps<T>) => {
  const points = getRoutedPoints(props);
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
    .join(' ');
  const middle = (points.length - 1) / 2;
  const before = points[Math.floor(middle)];
  const after = points[Math.ceil(middle)];
  const labelX = (before.x + after.x) / 2;
  const labelY = (before.y + after.y) / 2;
  return { path, labelX, labelY };
};

export const getRoutedPoints = (props: EdgeProps<Pick<StateEdgeData, 'points'>>) => {
  const original = props.data?.points || [
    { x: props.sourceX, y: props.sourceY },
    { x: props.targetX, y: props.targetY },
  ];
  return original.map((point, index) => offsetPoint(point, index, original, props));
};

function StateContent({ data }: Pick<NodeProps<StateNodeData>, 'data'>) {
  if (STATE_SYMBOLS.has(data.shape))
    return (
      <svg
        aria-label={data.shape}
        className="h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <StateSymbol shape={data.shape} />
      </svg>
    );
  const isRegion = data.shape === 'divider' || data.shape === 'noteGroup';
  if (isRegion) return null;
  if (data.shape === 'roundedWithTitle')
    return (
      <>
        <div className="px-2 py-1 text-center text-xs font-semibold">{data.label}</div>
        <Separator />
      </>
    );
  return (
    <div className="flex h-full items-center justify-center whitespace-pre-wrap px-2 text-center text-xs">
      {data.label}
    </div>
  );
}

const getStateAppearance = (data: StateNodeData): CSSProperties => {
  const {
    width: _width,
    height: _height,
    minWidth: _minWidth,
    minHeight: _minHeight,
    clipPath: _clip,
    aspectRatio: _ratio,
    padding: _padding,
    ...style
  } = data.style;
  const isGroup = STATE_GROUPS.has(data.shape);
  const backgroundColor = isGroup ? 'transparent' : style.backgroundColor;
  return Object.assign({}, style, {
    backgroundColor,
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    padding: 0,
  });
};

function StateSymbol({ shape }: Pick<StateNodeData, 'shape'>) {
  if (shape === 'choice') return <polygon points="50,0 100,50 50,100 0,50" fill="currentColor" />;
  if (shape === 'stateStart') return <circle cx="50" cy="50" r="48" fill="currentColor" />;
  if (shape === 'stateEnd')
    return (
      <>
        <circle cx="50" cy="50" r="45" fill="white" stroke="currentColor" strokeWidth="8" />
        <circle cx="50" cy="50" r="30" fill="currentColor" />
      </>
    );
  return <rect width="100" height="100" rx="4" fill="currentColor" />;
}

const offsetPoint = (
  point: StatePoint,
  index: number,
  points: readonly StatePoint[],
  props: EdgeProps<Pick<StateEdgeData, 'points'>>,
) => {
  const fraction = index / (points.length - 1);
  const first = points[0];
  const last = points[points.length - 1];
  const sourceX = props.sourceX - first.x;
  const sourceY = props.sourceY - first.y;
  const targetX = props.targetX - last.x;
  const targetY = props.targetY - last.y;
  const shiftX = sourceX + (targetX - sourceX) * fraction;
  const shiftY = sourceY + (targetY - sourceY) * fraction;
  const x = point.x + shiftX;
  const y = point.y + shiftY;
  return { x, y };
};
