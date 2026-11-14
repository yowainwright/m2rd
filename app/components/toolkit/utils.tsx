'use client';

import type { ChangeEvent } from 'react';
import type { GraphCanvasSettings, GraphShaderSettings } from '@/app/graph';
import { Badge } from '@/app/components/ui/badge';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldSet,
  FieldTitle,
} from '@/app/components/ui/field';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/app/components/ui/tooltip';
import { cn } from '@/app/lib/utils';
import {
  TOOLKIT_DATE_OPTIONS,
  TOOLKIT_METADATA_LABELS as LABELS,
  METADATA_BADGE_CLASS_NAME,
  TITLE_TOOLTIP_MAX_LENGTH,
} from './constants';
import type {
  EdgeMetadataProps,
  MetadataFieldsProps,
  NodeMetadataProps,
  ShaderColorKey,
  ShaderToolsProps,
  ToolkitMetadataProps,
} from './types';

export function ToolkitMetadata(props: ToolkitMetadataProps) {
  const versionNumber = props.version ? `v${props.version.version}` : LABELS.unsaved;
  return (
    <TooltipProvider>
      <FieldSet className="gap-1">
        <div className="flex items-center justify-between gap-2">
          <Badge className={METADATA_BADGE_CLASS_NAME} variant="outline">
            {versionNumber}
          </Badge>
          <Badge className={METADATA_BADGE_CLASS_NAME} variant="outline">
            {props.scope}
          </Badge>
        </div>
        <ToolkitDetails {...props} />
      </FieldSet>
    </TooltipProvider>
  );
}

export const getPatternPreviewStyle = (value: string, preview: string) => {
  if (value === 'pattern-diagonal') return { background: preview };
  if (value.startsWith('pattern-')) return { background: preview, backgroundSize: '8px 8px' };
  return { background: preview };
};

export const isPatternBackground = (background: GraphCanvasSettings['background']) =>
  background === 'grid' || background === 'dot-pattern' || background.startsWith('pattern-');

export const createShaderColorHandler =
  (
    shader: GraphShaderSettings,
    isAurora: boolean,
    key: ShaderColorKey,
    onUpdate: ShaderToolsProps['onUpdate'],
  ) =>
  (event: ChangeEvent<HTMLInputElement>) => {
    onUpdate(updateShaderColor(shader, isAurora, key, event.target.value));
  };

function ToolkitDetails(props: ToolkitMetadataProps) {
  const nodeCount = props.selectedNodeIds.length;
  const edgeCount = props.selectedEdgeIds.length;
  const isGlobal = nodeCount === 0 && edgeCount === 0;
  if (isGlobal) return <GlobalMetadata {...props} />;
  const node = props.elements.nodes.find((item) => item.id === props.selectedNodeIds[0]);
  const edge = props.elements.edges.find((item) => item.id === props.selectedEdgeIds[0]);
  const hasOnlyOneNode = nodeCount === 1 && edgeCount === 0;
  const hasOnlyOneEdge = edgeCount === 1 && nodeCount === 0;
  const isSingleNode = hasOnlyOneNode && node !== undefined;
  const isSingleEdge = hasOnlyOneEdge && edge !== undefined;
  if (isSingleNode) return <NodeMetadata node={node} />;
  if (isSingleEdge) return <EdgeMetadata edge={edge} />;
  const fields = [
    { label: LABELS.nodes, value: nodeCount },
    { label: LABELS.edges, value: edgeCount },
  ];
  return <MetadataFields fields={fields} />;
}

function GlobalMetadata({ version, workspaceName }: ToolkitMetadataProps) {
  const saved = version
    ? new Date(version.updatedAt).toLocaleString(undefined, TOOLKIT_DATE_OPTIONS)
    : null;
  const savedFields = saved ? [{ label: LABELS.saved, value: saved, hideLabel: true }] : [];
  const summaryFields: MetadataFieldsProps['fields'] = [
    { label: LABELS.name, value: workspaceName, hideLabel: true, emphasized: true },
  ];
  return (
    <>
      <MetadataFields className="w-full pt-1" fields={summaryFields} />
      <MetadataFields className="w-full" fields={savedFields} />
    </>
  );
}

function NodeMetadata({ node }: NodeMetadataProps) {
  const label = typeof node.data.label === 'string' ? node.data.label : LABELS.unlabeled;
  const fields = [
    { label: LABELS.label, value: label, hideLabel: true },
    { label: LABELS.id, value: node.id },
  ];
  return <MetadataFields fields={fields} />;
}

function EdgeMetadata({ edge }: EdgeMetadataProps) {
  const edgeLabel = edge.label;
  const hasLabel = typeof edgeLabel === 'string' && edgeLabel.length > 0;
  const label = hasLabel ? edgeLabel : LABELS.unlabeled;
  const fields = [
    { label: LABELS.label, value: label, hideLabel: true },
    { label: LABELS.id, value: edge.id },
    { label: LABELS.from, value: edge.source },
    { label: LABELS.to, value: edge.target },
  ];
  return <MetadataFields fields={fields} />;
}

function MetadataFields({ className, fields }: MetadataFieldsProps) {
  const items = fields.map((field) => <MetadataField key={field.label} {...field} />);
  return (
    <FieldGroup className={cn('flex-row flex-wrap gap-x-3 gap-y-0.5', className)}>
      {items}
    </FieldGroup>
  );
}

function MetadataField({
  emphasized,
  label,
  value,
  hideLabel,
}: MetadataFieldsProps['fields'][number]) {
  const text = String(value);
  const descriptionClassName = emphasized
    ? 'min-w-0 max-w-full flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-base font-semibold leading-5 text-foreground'
    : 'min-w-0 shrink-0 truncate text-xs leading-4 text-foreground';
  const description = (
    <FieldDescription className={descriptionClassName} title={emphasized ? undefined : text}>
      {text}
    </FieldDescription>
  );
  const needsTooltip = emphasized && text.length > TITLE_TOOLTIP_MAX_LENGTH;
  const content = needsTooltip ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="block min-w-0 max-w-full flex-1">{description}</div>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  ) : (
    description
  );
  const caption = hideLabel ? null : (
    <FieldTitle className="shrink-0 text-xs font-normal text-muted-foreground">{label}</FieldTitle>
  );
  const fieldClassName = cn('w-auto min-w-0 max-w-full gap-1', emphasized ? 'flex-1' : 'shrink-0');
  return (
    <Field aria-label={label} className={fieldClassName} key={label} orientation="horizontal">
      {caption}
      {content}
    </Field>
  );
}

const updateShaderColor = (
  shader: GraphShaderSettings,
  isAurora: boolean,
  key: ShaderColorKey,
  value: string,
) => {
  const isAuroraColorA = isAurora && key === 'colorA';
  const isAuroraColorB = isAurora && key === 'colorB';
  if (isAuroraColorA)
    return Object.assign({}, shader, {
      aurora: Object.assign({}, shader.aurora, { colorA: value }),
    });
  if (isAuroraColorB)
    return Object.assign({}, shader, {
      aurora: Object.assign({}, shader.aurora, { colorB: value }),
    });
  if (isAurora)
    return Object.assign({}, shader, {
      aurora: Object.assign({}, shader.aurora, { colorC: value }),
    });
  if (key === 'colorA')
    return Object.assign({}, shader, {
      gradientMesh: Object.assign({}, shader.gradientMesh, { colorA: value }),
    });
  return Object.assign({}, shader, {
    gradientMesh: Object.assign({}, shader.gradientMesh, { colorB: value }),
  });
};
