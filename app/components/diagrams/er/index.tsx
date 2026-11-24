'use client';

import { useEffect, useId } from 'react';
import { BaseEdge, useUpdateNodeInternals, type EdgeProps, type NodeProps } from 'reactflow';
import { Card } from '@/app/components/ui/card';
import { Separator } from '@/app/components/ui/separator';
import { StateHandles, getStateEdgePath } from '@/app/components/diagrams/state';
import { ER_MARKERS } from '@/app/graph/er/constants';
import type { ErCardinality, ErEdgeData, ErNodeData } from '@/app/graph/er/types';

export function ErDiagramNode({ id, data }: NodeProps<ErNodeData>) {
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => updateNodeInternals(id), [data.handles, id, updateNodeInternals]);
  const style = getErSurface(data);
  const rows = data.rows.map((row, index) => {
    const backgroundColor = data.style.backgroundColor ?? row.backgroundColor;
    const backgroundImage = data.style.backgroundImage ?? row.backgroundImage;
    const backgroundSize = data.style.backgroundSize ?? row.backgroundSize;
    const { borderColor, borderStyle, borderWidth } = style;
    const rowStyle = Object.assign({}, row, {
      backgroundColor,
      backgroundImage,
      backgroundSize,
      borderColor,
      borderStyle,
      borderWidth,
    });
    return <div key={index} style={rowStyle} />;
  });
  const cells = data.cells.map((cell, index) => (
    <div key={index} style={cell.style}>
      {cell.text}
    </div>
  ));
  const dividers = data.dividers.map((divider, index) => {
    const dividerStyle = Object.assign({}, divider.style, { backgroundColor: style.borderColor });
    return <Separator key={index} orientation={divider.orientation} style={dividerStyle} />;
  });
  return (
    <>
      <Card data-er-entity={data.label} style={style}>
        {rows}
        {cells}
        {dividers}
      </Card>
      <StateHandles data={data} />
    </>
  );
}

export function ErRelationEdge(props: EdgeProps<ErEdgeData>) {
  const markerId = useId();
  const route = getStateEdgePath(props);
  const color = String(props.style?.stroke || '#111827');
  const startId = `${markerId}-start`;
  const endId = `${markerId}-end`;
  const markerStart = `url(#${startId})`;
  const markerEnd = `url(#${endId})`;
  const dashed = props.data?.pattern === 'dashed';
  const strokeDasharray = dashed ? '5 4' : undefined;
  const style = Object.assign({}, props.style, { strokeDasharray });
  if (!props.data) return null;
  return (
    <>
      <defs>
        <RelationMarker id={startId} kind={props.data.startMarker} color={color} />
        <RelationMarker id={endId} kind={props.data.endMarker} color={color} />
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
    </>
  );
}

const getErSurface = (data: ErNodeData) =>
  Object.assign({}, data.sourceStyle, data.style, {
    position: 'relative' as const,
    width: '100%',
    height: '100%',
    padding: 0,
    minWidth: 0,
    minHeight: 0,
    borderRadius: 0,
    clipPath: undefined,
    aspectRatio: undefined,
  });

function RelationMarker({ id, kind, color }: { id: string; kind: ErCardinality; color: string }) {
  const marker = ER_MARKERS[kind];
  const middle = marker.height / 2;
  const circle = marker.circle ? <circle cx="9" cy={middle} r="6" fill="white" /> : null;
  return (
    <marker
      id={id}
      data-er-marker={kind}
      refX={marker.width}
      refY={middle}
      markerWidth={marker.width}
      markerHeight={marker.height}
      orient="auto-start-reverse"
      markerUnits="userSpaceOnUse"
      stroke={color}
      fill="none"
    >
      {circle}
      <path d={marker.path} />
    </marker>
  );
}
