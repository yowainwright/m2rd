export const STYLEGUIDE_EXAMPLES = [
  {
    title: 'Flowchart: nodes, decisions, and arrows',
    source:
      'flowchart TD\n A[Mermaid source] --> B{Valid?}\n B -->|Yes| C[SVG image]\n B -->|No| D[Error]',
  },
  {
    title: 'Sequence: messages and branches',
    source: `sequenceDiagram
    participant User
    participant CLI
    User->>CLI: Render diagram
    alt Valid source
        CLI-->>User: SVG image
    else Invalid source
        CLI-->>User: Error
    end`,
  },
  {
    title: 'State: start, transitions, and end',
    source:
      'stateDiagram-v2\n [*] --> Ready\n Ready --> Rendering: export\n Rendering --> Saved: success\n Saved --> [*]',
  },
];

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
  palette ~~~ diagram`;
