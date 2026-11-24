'use client';

import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/app/components/ui/sidebar';
import { GRAPH_VERSION_LIMIT } from '@/app/graph/constants';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip';
import { VERSION_DATE_OPTIONS, VERSION_RETENTION_NOTICE } from './constants';
import type { VersionRowProps, VersionTreeProps } from './types';

export type { VersionTreeItem } from './types';

export default function VersionTree({ activeId, disabled, onSelect, versions }: VersionTreeProps) {
  const hasPrunedVersions = versions.some((version) => version.version > GRAPH_VERSION_LIMIT);
  const oldestId = versions.at(-1)?.id;
  const rows = versions.map((version) => {
    const showRetentionNotice = hasPrunedVersions && version.id === oldestId;
    return (
      <VersionRow
        activeId={activeId}
        disabled={disabled}
        key={version.id}
        onSelect={onSelect}
        version={version}
        showRetentionNotice={showRetentionNotice}
      />
    );
  });

  return (
    <div aria-label="Version history" role="region">
      <SidebarMenuSub aria-label="Versions">{rows}</SidebarMenuSub>
    </div>
  );
}

function VersionRow({
  activeId,
  disabled,
  onSelect,
  version,
  showRetentionNotice,
}: VersionRowProps) {
  const isActive = version.id === activeId;
  const timestamp = new Date(version.timestamp).toLocaleString(undefined, VERSION_DATE_OPTIONS);
  const handleSelect = () => onSelect(version.id);

  const button = (
    <SidebarMenuSubButton asChild isActive={isActive} size="sm">
      <button aria-pressed={isActive} disabled={disabled} onClick={handleSelect} type="button">
        <span className="font-mono">v{version.version}</span>
        <time className="ml-auto text-muted-foreground" dateTime={version.timestamp}>
          {timestamp}
        </time>
      </button>
    </SidebarMenuSubButton>
  );
  if (!showRetentionNotice) return <SidebarMenuSubItem>{button}</SidebarMenuSubItem>;
  return (
    <SidebarMenuSubItem>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{VERSION_RETENTION_NOTICE}</TooltipContent>
      </Tooltip>
    </SidebarMenuSubItem>
  );
}
