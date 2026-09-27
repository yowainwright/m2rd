import type { MermaidConfig } from 'mermaid';

// CLI SVG defaults. Edit these values and rebuild with pnpm run cli:build.
// https://mermaid.js.org/config/theming.html
export const svgTheme: MermaidConfig = {
  theme: 'base',
  look: 'classic',
  themeVariables: {
    fontFamily: 'Open Sans, sans-serif',
    fontSize: '16px',
    background: '#FFFFFF',
    primaryColor: '#ECFEFF',
    primaryTextColor: '#164E63',
    primaryBorderColor: '#0891B2',
    secondaryColor: '#F0F9FF',
    secondaryTextColor: '#0C4A6E',
    secondaryBorderColor: '#0284C7',
    tertiaryColor: '#F8FAFC',
    tertiaryTextColor: '#334155',
    tertiaryBorderColor: '#94A3B8',
    lineColor: '#64748B',
    textColor: '#0F172A',
    edgeLabelBackground: '#FFFFFF',
    noteBkgColor: '#F0F9FF',
    noteTextColor: '#0C4A6E',
    noteBorderColor: '#38BDF8',
  },
};
