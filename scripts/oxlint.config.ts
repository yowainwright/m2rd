import { defineConfig } from 'oxlint';
import legibility from 'oxlint-plugin-legibility';

export default defineConfig({
  extends: [legibility.configs.strict],
  rules: {
    'legibility/no-unmatched-comments': 'error',
    'legibility/no-hidden-side-effects': [
      'error',
      {
        mutatingMethods: [
          'add',
          'clear',
          'copyWithin',
          'fill',
          'pop',
          'push',
          'reverse',
          'set',
          'shift',
          'sort',
          'splice',
          'unshift',
        ],
      },
    ],
    'no-restricted-properties': [
      'error',
      {
        object: 'Promise',
        property: 'all',
        message: 'Promise.all is not allowed. Use composable async work or Promise.allSettled.',
      },
    ],
  },
  overrides: [
    {
      files: ['**/app/components/ui/**'],
      rules: { 'max-lines-per-function': 'off' },
    },
    {
      files: ['**/app/**/*.ts', '**/app/**/*.tsx', '**/tests/**/*.ts'],
      rules: { 'require-await': 'warn' },
    },
  ],
});
