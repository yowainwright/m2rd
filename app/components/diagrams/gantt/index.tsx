'use client';

import type { CSSProperties } from 'react';
import type { NodeProps } from 'reactflow';
import { Card } from '@/app/components/ui/card';
import { Separator } from '@/app/components/ui/separator';
import type { GanttNodeData, GanttPart } from '@/app/graph/gantt/types';

export function GanttDiagramNode({ data }: NodeProps<GanttNodeData>) {
  const frame = data.kind === 'gantt-frame';
  const overflow = frame ? 'hidden' : 'visible';
  const style: CSSProperties = { overflow };
  const title = [data.label, data.status, data.start, data.end].filter(Boolean).join(' · ');
  const parts = data.parts.map((part, index) => {
    const style = frame ? part.style : getPartStyle(part, data.style);
    return <GanttPartView key={index} part={part} style={style} />;
  });
  return (
    <Card
      className="relative h-full w-full rounded-none border-0 bg-transparent p-0 shadow-none"
      style={style}
      data-gantt-kind={data.kind}
      data-gantt-task={frame ? undefined : data.label}
      data-gantt-status={data.status}
      title={frame ? undefined : title}
      aria-label={title}
    >
      {parts}
    </Card>
  );
}

const getPartStyle = (part: GanttPart, overrides: CSSProperties): CSSProperties => {
  if (part.kind === 'text') {
    const color = overrides.color ?? part.style.color;
    return Object.assign({}, part.style, { color });
  }
  const {
    backgroundColor,
    backgroundImage,
    backgroundSize,
    borderColor,
    borderStyle,
    borderWidth,
    boxShadow,
  } = overrides;
  const appearance = {
    backgroundColor,
    backgroundImage,
    backgroundSize,
    borderColor,
    borderStyle,
    borderWidth,
    boxShadow,
  };
  const defined = Object.fromEntries(
    Object.entries(appearance).filter(([, value]) => value !== undefined),
  );
  return Object.assign({}, part.style, defined);
};

function GanttPartView({ part, style }: { part: GanttPart; style: CSSProperties }) {
  if (part.kind === 'text') return <div style={style}>{part.text}</div>;
  if (part.kind === 'rect') return <Card style={style} data-gantt-bar />;
  const vertical = Number(style.height) > Number(style.width);
  const orientation = vertical ? 'vertical' : 'horizontal';
  return <Separator orientation={orientation} style={style} />;
}
