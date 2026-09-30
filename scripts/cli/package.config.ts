import { resolve } from 'node:path';
import type { BuildOptions, OutputOptions, Plugin } from 'rolldown';
import { replacePlugin } from 'rolldown/plugins';
import license from 'rollup-plugin-license';

const production = replacePlugin(
  { "process.env['DEV'] === 'true'": 'false' },
  { delimiters: ['', ''], preventAssignment: true },
);

const outputOptions = (dir: string): OutputOptions => ({
  dir,
  format: 'esm',
  minify: true,
  comments: { legal: true },
  entryFileNames: '[name].mjs',
  chunkFileNames: '[name]-[hash].mjs',
});

export const packageConfig = (
  directory: string,
  runtimeAssets: Plugin,
  worker: string,
): BuildOptions => {
  const entry = resolve(import.meta.dirname, '../../app/lib/cli/index.ts');
  const notices = resolve(directory, 'THIRD_PARTY_LICENSES.txt');
  const licenses = license({ thirdParty: { output: notices, multipleVersions: true } });
  const output = outputOptions(directory);
  return {
    input: { 'm2rd-cli': entry, 'xhr-sync-worker': worker },
    platform: 'node',
    external: ['canvas'],
    plugins: [production, runtimeAssets, licenses],
    transform: { target: 'node22.22.2', define: { 'process.env.NODE_ENV': '"production"' } },
    output,
  };
};
