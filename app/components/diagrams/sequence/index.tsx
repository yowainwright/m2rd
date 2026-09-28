'use client';

import { useEffect } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  useUpdateNodeInternals,
  type EdgeProps,
  type NodeProps,
} from 'reactflow';
import { SEQUENCE_HANDLE_STYLE, SEQUENCE_RIGHT_HANDLE_STYLE } from '@/app/graph/constants';
import type {
  SequenceActionData,
  SequenceFrameData,
  SequenceMessageData,
  SequenceNoteData,
  SequenceParticipantData,
} from '@/app/graph/types';
import { getFrameStyle, getHeaderStyle, getMessagePath } from './utils';

function ParticipantActivations({ data }: Pick<NodeProps<SequenceParticipantData>, 'data'>) {
  const activationStyle = {
    backgroundColor: data.style.backgroundColor,
    borderColor: data.style.borderColor,
  };
  return (data.activations || []).map((activation, index) => (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-0 border border-gray-400 bg-gray-100"
      key={`${activation.x}-${activation.y}-${index}`}
      style={Object.assign({}, activationStyle, {
        height: activation.height,
        left: activation.x,
        top: activation.y,
        width: activation.width,
      })}
    />
  ));
}

function ParticipantHandles({ data }: Pick<NodeProps<SequenceParticipantData>, 'data'>) {
  const handleStyle = SEQUENCE_HANDLE_STYLE;
  const rightHandleStyle = SEQUENCE_RIGHT_HANDLE_STYLE;
  return (data.handles || []).flatMap((handle) => [
    <Handle
      id={`${handle.id}-source-left`}
      key={`${handle.id}-source-left`}
      position={Position.Left}
      style={Object.assign({}, handleStyle, { top: handle.sourceY })}
      type="source"
    />,
    <Handle
      id={`${handle.id}-source-right`}
      key={`${handle.id}-source-right`}
      position={Position.Right}
      style={Object.assign({}, rightHandleStyle, { top: handle.sourceY })}
      type="source"
    />,
    <Handle
      id={`${handle.id}-target-left`}
      key={`${handle.id}-target-left`}
      position={Position.Left}
      style={Object.assign({}, handleStyle, { top: handle.targetY })}
      type="target"
    />,
    <Handle
      id={`${handle.id}-target-right`}
      key={`${handle.id}-target-right`}
      position={Position.Right}
      style={Object.assign({}, rightHandleStyle, { top: handle.targetY })}
      type="target"
    />,
  ]);
}

export function SequenceParticipantNode({ data, id }: NodeProps<SequenceParticipantData>) {
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => updateNodeInternals(id), [data.handles, id, updateNodeInternals]);
  const headerStyle = getHeaderStyle(data.style);
  const lifelineStyle = { borderColor: data.style.borderColor };
  const header = (
    <div
      className="flex h-16 w-full items-center justify-center rounded-sm border border-gray-200 bg-gray-100 px-3 text-center text-base font-medium text-gray-900"
      style={headerStyle}
    >
      {data.label}
    </div>
  );
  return (
    <div className="relative h-full w-full">
      <ParticipantActivations data={data} />
      <div className="relative z-10">{header}</div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-16 left-1/2 top-16 border-l-2 border-gray-400"
        style={lifelineStyle}
      />
      <div className="absolute bottom-0 left-0 z-10 w-full">{header}</div>
      <ParticipantHandles data={data} />
    </div>
  );
}

export function SequenceMessageEdge(props: EdgeProps<SequenceMessageData>) {
  const { data, interactionWidth, markerEnd, markerStart, sourceX, sourceY, style } = props;
  const path = getMessagePath(props, data?.selfMessage === true && data.segment === 'target');
  const edgeStyle = data?.dashed ? Object.assign({}, style, { strokeDasharray: '6 4' }) : style;

  return (
    <>
      <BaseEdge
        interactionWidth={interactionWidth}
        markerEnd={data?.markerEnd ? markerEnd : undefined}
        markerStart={data?.markerStart ? markerStart : undefined}
        path={path}
        style={edgeStyle}
      />
      <MessageSequenceNumber data={data} sourceX={sourceX} sourceY={sourceY} />
    </>
  );
}

function MessageSequenceNumber({
  data,
  sourceX,
  sourceY,
}: Pick<EdgeProps<SequenceMessageData>, 'data' | 'sourceX' | 'sourceY'>) {
  const showSequenceNumber = data?.segment === 'source' && Boolean(data.sequenceNumber);
  if (!showSequenceNumber) return null;
  return (
    <EdgeLabelRenderer>
      <div
        className="nodrag nopan pointer-events-none absolute"
        style={{ transform: `translate(-50%, -50%) translate(${sourceX}px, ${sourceY}px)` }}
      >
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-gray-700 px-1 text-xs font-semibold text-white">
          {data.sequenceNumber}
        </span>
      </div>
    </EdgeLabelRenderer>
  );
}

const actionHandleStyle = SEQUENCE_HANDLE_STYLE;

export function SequenceActionNode({ data }: NodeProps<SequenceActionData>) {
  const title = [data.sequenceNumber, data.label].filter(Boolean).join(' ');
  return (
    <>
      <Handle id="left-target" position={Position.Left} style={actionHandleStyle} type="target" />
      <Handle id="left-source" position={Position.Left} style={actionHandleStyle} type="source" />
      <div
        className="flex h-full w-full -translate-y-1/2 items-end justify-center whitespace-nowrap bg-transparent px-1 pb-1 text-base text-gray-900"
        style={data.style}
        title={title}
      >
        {data.label}
      </div>
      <Handle
        id="right-target"
        position={Position.Right}
        style={SEQUENCE_RIGHT_HANDLE_STYLE}
        type="target"
      />
      <Handle
        id="right-source"
        position={Position.Right}
        style={SEQUENCE_RIGHT_HANDLE_STYLE}
        type="source"
      />
    </>
  );
}

export function SequenceNoteNode({ data }: NodeProps<SequenceNoteData>) {
  return (
    <div
      className="h-full w-full rounded-sm border border-gray-200 bg-gray-50 p-2 text-sm text-gray-900"
      style={data.style}
    >
      {data.label}
    </div>
  );
}

export function SequenceFrameNode({ data }: NodeProps<SequenceFrameData>) {
  const frameStyle = getFrameStyle(data);
  const isRegion = data.frameType === 'rect';
  const className = isRegion
    ? 'pointer-events-none relative h-full w-full border-0 bg-gray-50 bg-[image:var(--sequence-pattern)] text-gray-700'
    : 'pointer-events-none relative h-full w-full border border-dashed border-gray-400 bg-transparent text-gray-700';
  const sections = data.sections.map((section) => (
    <div
      className="absolute inset-x-0 border-t border-dashed border-gray-400"
      key={`${section.label}-${section.y}`}
      style={{ top: section.y, borderColor: data.style.borderColor }}
    >
      <span className="ml-2 bg-white/90 px-1 text-sm">{section.label}</span>
    </div>
  ));
  const title = isRegion ? null : (
    <span className="absolute left-0 top-0 border-b border-r border-gray-300 bg-gray-100 px-2 text-sm font-medium">
      {data.frameType}
    </span>
  );
  const condition = data.label ? (
    <span className="absolute left-16 right-2 top-0 text-center text-sm">{data.label}</span>
  ) : null;
  return (
    <div className={className} style={frameStyle}>
      {title}
      {condition}
      {sections}
    </div>
  );
}
