import { defineConfig } from 'rolldown';

const CLI_EXTERNALS = [
  'ink',
  'react',
  'react/jsx-runtime',
  'effect',
  'mermaid',
  'svgdom',
  'jsdom',
  'dompurify',
  'elkjs/lib/elk.bundled.js',
  'string-width',
  'xstate',
  '@xstate/react',
];

export default defineConfig({
  input: 'app/lib/cli/index.ts',
  platform: 'node',
  transform: { target: 'node22.22.2' },
  external: CLI_EXTERNALS,
  output: {
    dir: 'tmp/cli',
    format: 'esm',
    entryFileNames: 'm2rd-cli.mjs',
    chunkFileNames: '[name]-[hash].mjs',
  },
});
