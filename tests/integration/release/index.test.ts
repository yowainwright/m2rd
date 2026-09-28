import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const workflow = readFileSync(resolve(root, '.github/workflows/gh-pages.yml'), 'utf8');
const block = workflow.match(
  /      - name: Resolve release revision[\s\S]*?        run: \|\n((?:          .*\n)+)/,
);
if (!block) throw new Error('Release revision step is missing');
const script = block[1].replace(/^ {10}/gm, '');
const gitStub = `git() {
  case "$1" in
    log) printf '%s' "$MOCK_RELEASE" ;;
    rev-parse) printf '%s' "$MOCK_HEAD" ;;
    *) return 1 ;;
  esac
}`;

const resolveRevision = (event: string, released = '', head = 'checked-main') => {
  const directory = mkdtempSync(resolve(root, '.next/cache/release-test-'));
  const outputFile = resolve(directory, 'output');
  const env = Object.assign({}, process.env, {
    EVENT_NAME: event,
    SOURCE_SHA: 'merge-sha',
    GITHUB_OUTPUT: outputFile,
    MOCK_RELEASE: released,
    MOCK_HEAD: head,
  });
  try {
    const result = spawnSync('bash', ['-euo', 'pipefail', '-c', `${gitStub}\n${script}`], {
      cwd: root,
      env,
      encoding: 'utf8',
    });
    const hasOutput = existsSync(outputFile);
    const output = hasOutput ? readFileSync(outputFile, 'utf8') : '';
    return { status: result.status, output };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

test('queues a patch for a new main push using the revision that checks will validate', () => {
  expect(resolveRevision('push')).toEqual({
    status: 0,
    output: 'sha=checked-main\nbump=true\n',
  });
});

test('reuses the recorded release on a retry without bumping again', () => {
  expect(resolveRevision('push', 'release-sha', 'release-sha')).toEqual({
    status: 0,
    output: 'sha=release-sha\nbump=false\n',
  });
});

test('manual dispatch preserves the selected revision and version', () => {
  expect(resolveRevision('workflow_dispatch')).toEqual({
    status: 0,
    output: 'sha=merge-sha\nbump=false\n',
  });
});

test('rejects a superseded release retry instead of rolling the site back', () => {
  expect(resolveRevision('push', 'old-release', 'new-main')).toEqual({
    status: 1,
    output: '',
  });
});
