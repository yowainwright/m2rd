'use client';

import { useEffect, useId, type CSSProperties } from 'react';
import {
  BaseEdge,
  EdgeText,
  useUpdateNodeInternals,
  type EdgeProps,
  type NodeProps,
} from 'reactflow';
import { Card } from '@/app/components/ui/card';
import { Separator } from '@/app/components/ui/separator';
import { StateHandles, getRoutedPoints, getStateEdgePath } from '@/app/components/diagrams/state';
import { CLASS_MARKER_PATHS } from '@/app/graph/class/constants';
import type { ClassEdgeData, ClassMarker, ClassNodeData } from '@/app/graph/class/types';
import type { StatePoint } from '@/app/graph/state/types';

export function ClassDiagramNode({ id, data }: NodeProps<ClassNodeData>) {
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => updateNodeInternals(id), [data.handles, id, updateNodeInternals]);
  const style = getClassSurface(data);
  const rows = data.rows.map((row, index) => (
    <div key={index} style={row.style}>
      {row.text}
    </div>
  ));
  const dividers = data.dividers.map((top, index) => {
    const dividerStyle = { top, backgroundColor: style.color };
    return <Separator key={index} className="absolute" style={dividerStyle} />;
  });
  return (
    <>
      <Card data-class-shape={data.shape} style={style}>
        {rows}
        {dividers}
      </Card>
      <StateHandles data={data} />
    </>
  );
}

export function ClassRelationEdge(props: EdgeProps<ClassEdgeData>) {
  const markerId = useId();
  const route = getStateEdgePath(props);
  const color = String(props.style?.stroke || '#111827');
  const startId = `${markerId}-start`;
  const endId = `${markerId}-end`;
  const start = props.data?.startMarker || 'none';
  const end = props.data?.endMarker || 'none';
  const markerStart = start === 'none' ? undefined : `url(#${startId})`;
  const markerEnd = end === 'none' ? undefined : `url(#${endId})`;
  const pattern = props.data?.pattern;
  let strokeDasharray: string | undefined;
  if (pattern === 'dashed') strokeDasharray = '5 4';
  if (pattern === 'dotted') strokeDasharray = '2 3';
  const style = Object.assign({}, props.style, { strokeDasharray });
  return (
    <>
      <defs>
        <RelationMarker id={startId} kind={start} color={color} />
        <RelationMarker id={endId} kind={end} color={color} />
      </defs>
      <BaseEdge
        id={props.id}
        {...route}
        label={props.label}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={props.interactionWidth}
        labelStyle={props.labelStyle}
        labelShowBg
      />
      <Cardinalities {...props} />
    </>
  );
}

const getClassSurface = (data: ClassNodeData): CSSProperties => {
  const backgroundColor =
    data.shape === 'namespace' ? 'transparent' : data.sourceStyle.backgroundColor;
  const style = Object.assign({}, data.sourceStyle, { backgroundColor }, data.style, {
    position: 'relative' as const,
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    padding: 0,
    borderRadius: 0,
    clipPath: undefined,
    aspectRatio: undefined,
  });
  if (data.shape !== 'interface') return style;
  return Object.assign({}, style, { background: 'transparent', border: 0, boxShadow: 'none' });
};

function RelationMarker({ id, kind, color }: { id: string; kind: ClassMarker; color: string }) {
  const refX = kind === 'lollipop' ? 13 : 18;
  return (
    <marker
      id={id}
      data-class-marker={kind}
      viewBox="0 0 20 14"
      refX={refX}
      refY="7"
      markerWidth="20"
      markerHeight="14"
      markerUnits="userSpaceOnUse"
      orient="auto-start-reverse"
    >
      <MarkerShape kind={kind} color={color} />
    </marker>
  );
}

function MarkerShape({ kind, color }: { kind: ClassMarker; color: string }) {
  if (kind === 'none') return null;
  if (kind === 'lollipop') return <circle cx="7" cy="7" r="6" fill="white" stroke={color} />;
  const path = CLASS_MARKER_PATHS[kind];
  let fill = 'white';
  if (kind === 'composition') fill = color;
  if (kind === 'dependency') fill = 'none';
  return <path d={path} fill={fill} stroke={color} />;
}

function Cardinalities(props: EdgeProps<ClassEdgeData>) {
  const points = getRoutedPoints(props);
  const start = getTerminalPosition(points[0], points[1], 1);
  const end = getTerminalPosition(points[points.length - 1], points[points.length - 2], 1);
  return (
    <g data-class-cardinalities="true">
      <EdgeText {...start} label={props.data?.startLabel} labelStyle={props.labelStyle} />
      <EdgeText {...end} label={props.data?.endLabel} labelStyle={props.labelStyle} />
    </g>
  );
}

const getTerminalPosition = (point: StatePoint, neighbor: StatePoint, side: number) => {
  const dx = neighbor.x - point.x;
  const dy = neighbor.y - point.y;
  const length = Math.hypot(dx, dy) || 1;
  const x = point.x + (dx * 28 - dy * side * 12) / length;
  const y = point.y + (dy * 28 + dx * side * 12) / length;
  return { x, y };
};
