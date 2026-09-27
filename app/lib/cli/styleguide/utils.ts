import { createElement, type ReactNode } from 'react';
import { Box, Text, renderToString } from 'ink';
import { Panel } from '@/app/components/ui/panel';
import { UnicodeContext } from '@/app/hooks/useUnicode';
import { NODE_COLORS } from '../renders/flowchart/constants';
import { svgTheme } from '../themes/mermaid/constants';
import type { CliOptions } from '../types';
import { SVG_STYLEGUIDE_SOURCE, SVG_SWATCHES } from './constants';

const colorRow = ([name, color]: [string, string]) => {
  const swatch = createElement(Text, { backgroundColor: color }, '  ');
  const label = createElement(Text, null, ` ${name}: ${color}`);
  return createElement(Box, { key: name, gap: 1 }, swatch, label);
};

const styleguidePanel = (title: string, children: ReactNode, options: CliOptions) => {
  const panel = createElement(Panel, { title, width: options.width, bordered: false }, children);
  const value = { unicode: !options.ascii };
  const tree = createElement(UnicodeContext.Provider, { value }, panel);
  return renderToString(tree, { columns: options.width });
};

export const styleguideColors = (options: CliOptions) => {
  const nodes = colorRow(['Node borders', NODE_COLORS.default]);
  const decisions = colorRow(['Decision borders', NODE_COLORS.decision]);
  const swatch = createElement(Text, { inverse: true }, '  ');
  const label = createElement(Text, null, ' Text and connectors: terminal foreground');
  const foreground = createElement(Box, { key: 'foreground', gap: 1 }, swatch, label);
  return styleguidePanel('Colors', [nodes, decisions, foreground], options);
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
