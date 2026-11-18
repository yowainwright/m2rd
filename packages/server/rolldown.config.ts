import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'rolldown';

const require = createRequire(import.meta.url);
const { dependencies } = require('./package.json');
const packages = Object.keys(dependencies);
const root = resolve(import.meta.dirname, '../..');

const appEntries = { index: 'src/index.ts', render: 'src/render/index.ts' };
const testEntries = { ...appEntries, e2e: '../../tests/e2e/runtime.ts' };
const input = process.env.M2RD_E2E_RUNTIME === '1' ? testEntries : appEntries;

export default defineConfig({
  input,
  platform: 'node',
  transform: { target: 'node26' },
  resolve: { alias: { '@': root } },
  external: (id) => packages.some((name) => id === name || id.startsWith(`${name}/`)),
  output: { dir: 'dist', format: 'esm', entryFileNames: '[name].mjs' },
});
