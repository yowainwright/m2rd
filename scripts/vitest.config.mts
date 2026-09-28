import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const root = resolve(import.meta.dirname, '..');
const nodeTests = [
  'tests/integration/cli/**/*.test.ts',
  'tests/integration/release/**/*.test.ts',
  'tests/unit/lib/cli/**/*.test.ts',
];
const domTests = [
  'tests/{integration,unit}/**/*.test.{ts,tsx}',
  'tests/{integration,unit}/**/start.ts',
];
const domExcluded = ['tests/unit/scripts/**'].concat(nodeTests);

export default defineConfig({
  root,
  resolve: {
    alias: {
      '@': root,
    },
  },
  test: {
    projects: [
      { test: { name: 'node', environment: 'node', include: nodeTests } },
      {
        test: {
          name: 'dom',
          environment: 'happy-dom',
          include: domTests,
          exclude: domExcluded,
        },
      },
    ],
  },
});
