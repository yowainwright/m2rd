import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Effect } from 'effect';
import {
  COMPONENTS_TARGET,
  DOCKER_ARGUMENTS,
  MCP_CONFIG_PATH,
  SHADCN_IMAGE,
  SKILL_CONTENT,
  SKILL_PATH,
} from './constants.ts';
import type { GeneratedFile, McpConfiguration } from './types.ts';

export const createMcpConfiguration = (
  root = resolve(import.meta.dirname, '../..'),
): McpConfiguration => {
  const componentsFile = resolve(root, 'components.json');
  const dockerArguments = DOCKER_ARGUMENTS.concat(
    '--mount',
    `type=bind,source=${componentsFile},target=${COMPONENTS_TARGET},readonly`,
    SHADCN_IMAGE,
  );
  return { mcpServers: { shadcn: { command: 'docker', args: dockerArguments } } };
};

export const createMcpFiles = (root = resolve(import.meta.dirname, '../..')): GeneratedFile[] => {
  const configuration = createMcpConfiguration(root);
  const content = JSON.stringify(configuration, null, 2).concat('\n');
  return [
    { path: MCP_CONFIG_PATH, content },
    { path: SKILL_PATH, content: SKILL_CONTENT },
  ];
};

const writeMcpFile = (root: string, file: GeneratedFile) => {
  return Effect.try(() => {
    const destination = resolve(root, file.path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, file.content, 'utf8');
  });
};

export const generateMcpSkill = (root: string) => {
  const files = createMcpFiles(root);
  return Effect.forEach(files, (file) => writeMcpFile(root, file), {
    concurrency: 1,
    discard: true,
  });
};
