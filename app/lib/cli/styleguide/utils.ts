import { createElement, type ReactNode } from 'react';
import { Box, Text, renderToString } from 'ink';
import { Panel } from '@/app/components/ui/panel';
import { UnicodeContext } from '@/app/hooks/useUnicode';
import { defaultTheme } from '../themes/constants';
import { svgTheme } from '../themes/mermaid/constants';
import type { CliOptions } from '../types';
import { SVG_STYLEGUIDE_SOURCE, SVG_SWATCHES } from './constants';

const colorRow = ([name, color]: [string, string]) => {
  const swatch = createElement(Text, { backgroundColor: color }, '  ');
  const label = createElement(Text, null, ` ${name}: ${color}`);
  return createElement(Box, { key: name, gap: 1 }, swatch, label);
};

export const styleguidePanel = (title: string, children: ReactNode, options: CliOptions) => {
  const panel = createElement(Panel, { title, width: options.width }, children);
  const value = { unicode: !options.ascii };
  const tree = createElement(UnicodeContext.Provider, { value }, panel);
  return renderToString(tree, { columns: options.width });
};

const typography = () => {
  const normal = createElement(Text, null, 'Normal diagram label');
  const bold = createElement(Text, { bold: true }, 'Bold heading');
  const muted = createElement(Text, { dimColor: true }, 'Muted hint');
  return createElement(Box, { flexDirection: 'column' }, normal, bold, muted);
};

export const styleguideTokens = (options: CliOptions) => {
  const colors = Object.entries(defaultTheme.colors).map(colorRow);
  const terminal = styleguidePanel('Terminal colors', colors, options);
  const text = styleguidePanel('Typography', typography(), options);
  const variables = Object.entries(svgTheme.themeVariables);
  const values = variables.map(([name, value]) => `${name}: ${value}`).join('\n');
  const details = createElement(Text, null, values);
  const svg = styleguidePanel('Mermaid SVG theme', details, options);
  return [terminal, text, svg].join('\n\n');
};

const svgSwatch = ({ label, fill, text, border }: (typeof SVG_SWATCHES)[number]) => {
  const variables = svgTheme.themeVariables;
  const background = variables[fill];
  const foreground = variables[text];
  const stroke = variables[border];
  return [
    `${label}["${label}: ${background}"]:::${label}`,
    `classDef ${label} fill:${background},color:${foreground},stroke:${stroke}`,
  ].join('\n');
};

export const svgStyleguideSource = () => {
  const swatches = SVG_SWATCHES.map(svgSwatch);
  return [SVG_STYLEGUIDE_SOURCE].concat(swatches).join('\n');
};
