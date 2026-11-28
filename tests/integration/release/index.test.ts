import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const cache = resolve(root, '.next/cache');
const workflow = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8');
const block = workflow.match(
  /      - name: Resolve release revision[\s\S]*?        run: \|\n((?:          .*\n)+)/,
);
if (!block) throw new Error('Release revision step is missing');
const script = block[1].replace(/^ {10}/gm, '');
const gitStub = `jq() { return 127; }
git() {
  case "$1" in
    log) printf '%s' "$MOCK_RELEASE" ;;
    rev-parse) printf '%s' "$MOCK_HEAD" ;;
    show) printf '%s' '{"version":"0.0.18"}' ;;
    *) return 1 ;;
  esac
}`;

const resolveRevision = (released = '', head = 'requested-main', increment = 'patch') => {
  mkdirSync(cache, { recursive: true });
  const directory = mkdtempSync(resolve(cache, 'release-test-'));
  const outputFile = resolve(directory, 'output');
  const env = Object.assign({}, process.env, {
    SOURCE_SHA: 'requested-main',
    INCREMENT: increment,
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

test.each(['patch', 'minor', 'major'])(
  'queues a %s for the selected main revision',
  (increment) => {
    expect(resolveRevision('', 'requested-main', increment)).toEqual({
      status: 0,
      output: 'sha=requested-main\nbump=true\n',
    });
  },
);

test('rejects unsupported version increments', () => {
  expect(resolveRevision('', 'requested-main', 'premajor')).toEqual({ status: 1, output: '' });
});

test('reuses the recorded release on a retry without bumping again', () => {
  expect(resolveRevision('release-sha', 'release-sha')).toEqual({
    status: 0,
    output: 'sha=release-sha\nbump=false\ntag=v0.0.18\n',
  });
});

test('rejects a dispatch after main advances', () => {
  expect(resolveRevision('', 'new-main')).toEqual({
    status: 1,
    output: '',
  });
});

test('rejects a superseded release retry instead of rolling the site back', () => {
  expect(resolveRevision('old-release', 'new-main')).toEqual({
    status: 1,
    output: '',
  });
});

test('pins publication to the release commit on the first run and on retries', () => {
  const publish = workflow.split('\n  publish:\n')[1].split('\n  npm:\n')[0];
  expect(publish).toContain(
    'RELEASE_SHA: ${{ needs.release.outputs.sha || needs.revision.outputs.sha }}',
  );
  expect(publish).toContain('ref: ${{ env.RELEASE_SHA }}');
  const verify = publish.match(
    /- name: Verify release commit and tag\n +run: \|\n((?:          .+\n)+)/,
  );
  if (!verify) throw new Error('Release tag verification is missing.');
  const beforeSetup = publish.split('- name: Setup pnpm')[0];
  expect(beforeSetup).toContain(verify[0]);
  const git =
    'git() { case "$*" in "rev-parse HEAD") echo commit ;; "rev-parse --verify refs/tags/v1^{commit}") echo "$TAG_SHA" ;; *) return 1 ;; esac; }';
  const verifyTag = (tagSha: string) =>
    spawnSync('bash', ['-ec', git + '\n' + verify[1]], {
      env: { NODE_ENV: 'test', TAG: 'v1', RELEASE_SHA: 'commit', TAG_SHA: tagSha },
    }).status;
  expect(verifyTag('commit')).toBe(0);
  expect(verifyTag('different')).toBe(1);
});
