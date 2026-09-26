import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { expect, it } from 'vitest';
import { APP_INITIAL_CONTEXT } from '@/app/constants';

it('preserves an existing version-1 database and appends its next save', async () => {
  const legacy = new Dexie('m2rd');
  legacy.version(1).stores({
    inputs: 'id, workspaceId, updatedAt',
    translations: 'id, inputId, updatedAt',
    workspaces: 'id, updatedAt',
  });
  const entries = Object.entries(APP_INITIAL_CONTEXT.input);
  const legacyEntries = entries.filter(([key]) => key !== 'version');
  const input = Object.fromEntries(legacyEntries);
  const { translation, workspace } = APP_INITIAL_CONTEXT;
  await legacy.table('inputs').put(input);
  await legacy.table('translations').put(translation);
  await legacy.table('workspaces').put(workspace);
  legacy.close();

  const { graphRepository } = await import('@/app/graph');
  const loaded = await graphRepository.read(workspace.id);
  expect(loaded?.input).toEqual(Object.assign({}, input, { version: 1 }));
  expect(loaded?.translation).toEqual(translation);
  expect(loaded?.versions).toHaveLength(1);

  const updated = await graphRepository.update({
    input: { source: 'flowchart LR\n  A --> B' },
    translation,
    workspace,
  });
  expect(updated.versions.map((version) => version.version)).toEqual([2, 1]);
  expect((await graphRepository.read(workspace.id, String(input.id)))?.input.source).toBe(
    input.source,
  );
  await graphRepository.delete(workspace.id);
});
