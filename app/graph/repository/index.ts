import Dexie from 'dexie';
import {
  GRAPH_DATABASE_NAME,
  GRAPH_INPUT_FORMAT,
  GRAPH_TABLES,
  GRAPH_VERSION_LIMIT,
  EMPTY_GRAPH_NAME_ERROR,
  LEGACY_UNTITLED_GRAPH_NAME,
  MISSING_GRAPH_ERROR,
} from '../constants';
import type {
  CreateGraphRecordsInput,
  GraphDatabase,
  GraphInput,
  GraphRecords,
  GraphRepository,
  GraphWorkspace,
  UpdateGraphRecordsInput,
} from '../types';

const database = new Dexie(GRAPH_DATABASE_NAME) as GraphDatabase;
const tables = [GRAPH_TABLES.workspaces, GRAPH_TABLES.inputs, GRAPH_TABLES.translations];

database.version(1).stores({
  [GRAPH_TABLES.inputs]: 'id, workspaceId, updatedAt',
  [GRAPH_TABLES.translations]: 'id, inputId, updatedAt',
  [GRAPH_TABLES.workspaces]: 'id, updatedAt',
});

database
  .version(2)
  .stores({
    [GRAPH_TABLES.inputs]: 'id, workspaceId, updatedAt, [workspaceId+version]',
  })
  .upgrade((transaction) =>
    transaction.table(GRAPH_TABLES.inputs).toCollection().modify({ version: 1 }),
  );

const readInputs = (workspaceId: string) => {
  const lower = [workspaceId, Dexie.minKey];
  const upper = [workspaceId, Dexie.maxKey];
  return database.inputs.where('[workspaceId+version]').between(lower, upper).reverse().toArray();
};

const toVersion = ({ id, updatedAt, version }: GraphInput) => {
  return { id, updatedAt, version };
};

const createRecords = (
  records: CreateGraphRecordsInput,
  workspaceId: string = records.workspace.id || crypto.randomUUID(),
  version = 1,
): GraphRecords => {
  const id = crypto.randomUUID();
  const translationId = crypto.randomUUID();
  const updatedAt = new Date().toISOString();
  const input = Object.assign({}, records.input, { id, updatedAt, version, workspaceId });
  const translation = Object.assign({}, records.translation, {
    id: translationId,
    inputId: id,
    updatedAt,
  });
  const workspace = Object.assign({}, records.workspace, {
    activeInputId: id,
    activeTranslationId: translationId,
    id: workspaceId,
    updatedAt,
  });
  const versions = [toVersion(input)];
  return { input, translation, versions, workspace };
};

const deleteInputs = async (inputs: GraphInput[]) => {
  const ids = inputs.map((input) => input.id);
  await database.translations.where('inputId').anyOf(ids).delete();
  await database.inputs.bulkDelete(ids);
};

const putRecords = async (records: GraphRecords) => {
  await database.workspaces.put(records.workspace);
  await database.inputs.put(records.input);
  await database.translations.put(records.translation);
  const inputs = await readInputs(records.workspace.id);
  const expired = inputs.slice(GRAPH_VERSION_LIMIT);
  await deleteInputs(expired);
  const versions = inputs.slice(0, GRAPH_VERSION_LIMIT).map(toVersion);
  return Object.assign({}, records, { versions });
};

const readRecords = async (
  workspaceId: string,
  versionId?: string,
): Promise<GraphRecords | null> => {
  const workspace = await database.workspaces.get(workspaceId);
  if (!workspace) return null;
  const inputId = versionId || workspace.activeInputId;
  if (!inputId) return null;
  const input = await database.inputs.get(inputId);
  if (!input) return null;
  const belongsToWorkspace = input?.workspaceId === workspaceId;
  if (!belongsToWorkspace) return null;
  const translation = await database.translations.where('inputId').equals(input.id).first();
  if (!translation) return null;
  const inputs = await readInputs(workspaceId);
  const versions = inputs.map(toVersion);
  return { input, translation, versions, workspace };
};

const updateRecords = async (records: UpdateGraphRecordsInput) => {
  const existing = await readRecords(records.workspace.id);
  if (!existing) throw new Error('Workspace is missing saved records.');
  const version = existing.input.version + 1;
  const input = Object.assign({}, records.input, { format: GRAPH_INPUT_FORMAT });
  const update = Object.assign({}, records, { input });
  const created = createRecords(update, existing.workspace.id, version);
  return putRecords(created);
};

export const graphRepository: GraphRepository = {
  create(input) {
    return database.transaction('rw', tables, () => putRecords(createRecords(input)));
  },
  delete(workspaceId) {
    return database.transaction('rw', tables, async () => {
      const inputs = await database.inputs.where('workspaceId').equals(workspaceId).toArray();
      await deleteInputs(inputs);
      await database.workspaces.delete(workspaceId);
    });
  },
  list() {
    const workspaces = database.workspaces.orderBy('updatedAt').reverse();
    return workspaces.toArray();
  },
  read(workspaceId, versionId) {
    return database.transaction('r', tables, () => readRecords(workspaceId, versionId));
  },
  rename(workspaceId, name) {
    return database.transaction('rw', database.workspaces, async () => {
      const title = name.trim();
      if (!title) throw new Error(EMPTY_GRAPH_NAME_ERROR);
      const existing = await database.workspaces.get(workspaceId);
      if (!existing) throw new Error(MISSING_GRAPH_ERROR);
      const updatedAt = new Date().toISOString();
      const workspace = Object.assign({}, existing, { name: title, updatedAt });
      await database.workspaces.put(workspace);
      return workspace;
    });
  },
  update(records) {
    return database.transaction('rw', tables, () => updateRecords(records));
  },
};

export const getWorkspaceLabel = (workspace: GraphWorkspace, fallback = workspace.id) => {
  const name = workspace.name.trim();
  const isUntitled = name.length === 0 || name === LEGACY_UNTITLED_GRAPH_NAME;
  return isUntitled ? fallback : name;
};
