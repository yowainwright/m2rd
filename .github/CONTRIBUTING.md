# Contributing to m2rd

Thanks for your interest in contributing to m2rd.

## Development Setup

1. Fork and clone the repository
2. Install Node 26 and pnpm 12
3. Install dependencies: `pnpm install --frozen-lockfile`
4. Install local hooks: `pnpm run lint/setup`

## Development Workflow

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Run checks: `pnpm run validate`

## Testing

- Unit tests: `pnpm run test:unit`
- Integration tests: `pnpm run test:integration`
- End-to-end tests: `pnpm run test:e2e`
- All checks: `pnpm run validate`

Mirror source paths in unit tests: `app/graph/er/index.ts` maps to
`tests/unit/graph/er/index.test.ts`; component `index.tsx` maps to `index.test.tsx`.
Script tests retain the `scripts/` prefix. Group tests by the source module they
exercise. Use integration tests for workflows spanning systems and `.spec.ts`
files in `tests/e2e/` for browser journeys.

## Code Style

- TypeScript strict mode enabled
- No `any` types (use `unknown` or proper types)
- Prefer `const` over `let`
- Functional programming patterns preferred
- Extract complex conditionals into well-named variables
- Keep functions single-purpose and under 20 lines
- Run `pnpm run lint/session` before commit-ready work

## Pull Request Process

1. Ensure all tests pass
2. Ensure type check passes
3. Ensure build succeeds
4. Update documentation if needed
5. Create a pull request with a clear description
6. Link any related issues

## Issue Reporting

When reporting issues, please include:

- React version
- m2rd version
- Browser (if applicable)
- Minimal reproduction case
- Error messages and stack traces
