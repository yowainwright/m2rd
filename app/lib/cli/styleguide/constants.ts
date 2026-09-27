export const STYLEGUIDE_VIEWPORT = { columns: 60, rows: 24 };
export const STYLEGUIDE_EXPORT_PATH = 'm2rd-styleguide.svg';

export const STYLEGUIDE_EXAMPLE = 'flowchart TD\n A[Mermaid] --> B{Valid?}\n B --> C[SVG]';

export const SVG_SWATCHES = [
  {
    label: 'Primary',
    fill: 'primaryColor',
    text: 'primaryTextColor',
    border: 'primaryBorderColor',
  },
  {
    label: 'Secondary',
    fill: 'secondaryColor',
    text: 'secondaryTextColor',
    border: 'secondaryBorderColor',
  },
  {
    label: 'Tertiary',
    fill: 'tertiaryColor',
    text: 'tertiaryTextColor',
    border: 'tertiaryBorderColor',
  },
  { label: 'Note', fill: 'noteBkgColor', text: 'noteTextColor', border: 'noteBorderColor' },
];

export const SVG_STYLEGUIDE_SOURCE = `---
title: m2rd Mermaid theme
---
flowchart TB
  subgraph palette[Theme colors]
    direction LR
    Primary ~~~ Secondary ~~~ Tertiary ~~~ Note
  end
  subgraph diagram[Shapes and connectors]
    direction LR
    Source([Start]) --> Render[Render diagram]
    Render --> Valid{Valid?}
    Valid -->|Yes| Image[SVG image]
    Valid -.->|No| Error[Error message]
  end
  diagram ~~~ palette`;
