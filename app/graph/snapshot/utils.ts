import createDOMPurify from 'dompurify';
import { Effect, Schema } from 'effect';
import {
  MAX_SNAPSHOT_BYTES,
  MAX_SOURCE_BYTES,
  MAX_SVG_BYTES,
  SNAPSHOT_FILE,
  SNAPSHOT_ORIGIN,
  SNAPSHOT_PATH,
  SnapshotSaveIdSchema,
  SnapshotSchema,
} from './constants';
import type {
  EncodeSnapshotInput,
  Snapshot,
  SnapshotLink,
  SnapshotRecords,
  SnapshotWindow,
} from './types';

const parseOptions = { onExcessProperty: 'error' } as const;
const snapshotJson = Schema.fromJsonString(SnapshotSchema);
const decodeJson = Schema.decodeUnknownEffect(snapshotJson, parseOptions);
const decodeEnvelope = Schema.decodeUnknownEffect(SnapshotSchema, parseOptions);
const encodeJson = Schema.encodeEffect(snapshotJson, parseOptions);
const decodeSaveId = Schema.decodeUnknownOption(SnapshotSaveIdSchema);
const encoder = new TextEncoder();
const svgNamespace = 'http://www.w3.org/2000/svg';
const unsafeElements =
  'script, iframe, object, embed, link, base, meta, form, input, button, textarea, select, video, audio, animate, animateMotion, animateTransform, set, discard';
const urlAttributes = new Set(['href', 'src', 'poster', 'background', 'cite', 'longdesc']);
const disallowedAttributes = new Set(['srcset', 'srcdoc', 'action', 'formaction', 'ping', 'base']);
const localReference = /^#[^\s<>"']*$/;
const embeddedResource =
  /^data:(?:image\/(?:png|jpeg|gif|webp|avif)|font\/(?:woff2?|ttf|otf)|application\/(?:font-woff|octet-stream|x-font-ttf));base64,[a-z\d+/]+={0,2}$/i;

export const encodeSnapshot = (
  input: EncodeSnapshotInput,
  dom?: SnapshotWindow,
): Effect.Effect<string, Error> => {
  const { input: source, translation, workspace } = input.records;
  const envelope = {
    format: 'm2rd.snapshot',
    schemaVersion: 1,
    saveId: input.saveId,
    ordinal: input.ordinal,
    records: { input: source, translation, workspace },
    svg: { mimeType: 'image/svg+xml', text: input.svg },
    forkedFrom: input.forkedFrom,
  };
  return decodeEnvelope(envelope).pipe(
    Effect.flatMap((snapshot) => validateSnapshot(snapshot, dom)),
    Effect.flatMap(encodeJson),
    Effect.flatMap(checkSnapshotSize),
    Effect.mapError(toError),
  );
};

export const decodeSnapshot = (
  json: string,
  dom?: SnapshotWindow,
): Effect.Effect<Snapshot, Error> =>
  checkSnapshotSize(json).pipe(
    Effect.flatMap(decodeJson),
    Effect.flatMap((snapshot) => validateSnapshot(snapshot, dom)),
    Effect.mapError(toError),
  );

export const parseSnapshotLink = (path: string): SnapshotLink | null => {
  const pathname = path.startsWith(SNAPSHOT_ORIGIN) ? path.slice(SNAPSHOT_ORIGIN.length) : path;
  const match = SNAPSHOT_PATH.exec(pathname);
  if (!match) return null;
  const [, gistId, revision] = match;
  return { gistId: gistId.toLowerCase(), revision: revision.toLowerCase() };
};

export const formatSnapshotLink = ({ gistId, revision }: SnapshotLink) => {
  const pathname = `/m2rd/${gistId}-${revision}`;
  if (!SNAPSHOT_PATH.test(pathname)) throw new Error('Invalid snapshot link.');
  const url = `${SNAPSHOT_ORIGIN}${pathname}`;
  return url.toLowerCase();
};

export const getSnapshotFileName = (ordinal: number, saveId: string) => {
  const validOrdinal = Number.isSafeInteger(ordinal) && ordinal > 0 && ordinal < 10_000_000_000;
  const invalidFile = !validOrdinal || decodeSaveId(saveId)._tag === 'None';
  if (invalidFile) {
    throw new Error('Invalid snapshot filename.');
  }
  const sequence = String(ordinal).padStart(10, '0');
  return `m2rd-${sequence}-${saveId}.json`;
};

export const parseSnapshotFileName = (fileName: string) => {
  const match = SNAPSHOT_FILE.exec(fileName);
  if (!match) return null;
  const [, sequence, saveId] = match;
  const ordinal = Number(sequence);
  const invalidFile = ordinal < 1 || decodeSaveId(saveId)._tag === 'None';
  if (invalidFile) return null;
  return { ordinal, saveId, fileName };
};

export const selectSnapshotFile = (fileNames: readonly string[]) => {
  const candidates = fileNames.flatMap((fileName) => parseSnapshotFileName(fileName) ?? []);
  const ordinal = Math.max(0, ...candidates.map((file) => file.ordinal));
  const newest = candidates.filter((file) => file.ordinal === ordinal);
  if (newest.length !== 1) throw new Error('The revision has no unique snapshot file.');
  return newest[0];
};

const checkSnapshotSize = (json: string) => {
  if (encoder.encode(json).byteLength > MAX_SNAPSHOT_BYTES) {
    return Effect.fail(new Error('Snapshot exceeds the size limit.'));
  }
  return Effect.succeed(json);
};

const validateSnapshot = (snapshot: Snapshot, dom?: SnapshotWindow) =>
  Effect.try({
    try: () => {
      validateRecords(snapshot.records);
      validateSvg(snapshot.svg.text, dom);
      return snapshot;
    },
    catch: toError,
  });

const validateRecords = ({ input, translation, workspace }: SnapshotRecords) => {
  if (encoder.encode(input.source).byteLength > MAX_SOURCE_BYTES) {
    throw new Error('Mermaid source exceeds the size limit.');
  }
  const linkedWorkspace = input.workspaceId === workspace.id;
  const linkedInput = workspace.activeInputId === input.id && translation.inputId === input.id;
  const linkedTranslation = workspace.activeTranslationId === translation.id;
  const linked = linkedWorkspace && linkedInput && linkedTranslation;
  if (!linked) throw new Error('Snapshot records reference a different workspace.');
  const { edges, nodes } = translation.elements;
  const parents = new Map(nodes.map((node) => [node.id, node.parentId ?? node.parentNode]));
  const edgeIds = new Set(edges.map((edge) => edge.id));
  const duplicates = parents.size !== nodes.length || edgeIds.size !== edges.length;
  if (duplicates) {
    throw new Error('Snapshot contains duplicate element IDs.');
  }
  const disconnected = edges.some((edge) => !parents.has(edge.source) || !parents.has(edge.target));
  if (disconnected) throw new Error('Snapshot edge references a missing node.');
  nodes.forEach((node) => validateParent(node, parents));
};

const validateParent = (
  node: SnapshotRecords['translation']['elements']['nodes'][number],
  parents: ReadonlyMap<string, string | undefined>,
) => {
  const parent = node.parentId ?? node.parentNode;
  const conflictingParents = node.parentId && node.parentNode && node.parentId !== node.parentNode;
  const missingParentExtent = node.extent === 'parent' && !parent;
  const inconsistentParent = conflictingParents || missingParentExtent;
  if (inconsistentParent) {
    throw new Error('Snapshot node has inconsistent parent references.');
  }
  const visited = new Set([node.id]);
  let ancestor = parent;
  while (ancestor !== undefined) {
    const invalidAncestor = !parents.has(ancestor) || visited.has(ancestor);
    if (invalidAncestor) {
      throw new Error('Snapshot node has a missing or circular parent.');
    }
    visited.add(ancestor);
    ancestor = parents.get(ancestor);
  }
};

const validateSvg = (text: string, dom?: SnapshotWindow) => {
  const size = encoder.encode(text).byteLength;
  const invalidSize = size === 0 || size > MAX_SVG_BYTES;
  if (invalidSize) throw new Error('SVG exceeds the size limit.');
  const environment = dom ?? globalThis.window;
  const svg = new environment.DOMParser().parseFromString(text, 'image/svg+xml');
  const root = svg.documentElement;
  const invalidRoot = root.localName !== 'svg' || root.namespaceURI !== svgNamespace;
  const hasProcessingInstruction = Array.from(svg.childNodes).some((node) => node.nodeType === 7);
  const unsupported =
    invalidRoot || svg.doctype || hasProcessingInstruction || root.querySelector(unsafeElements);
  if (unsupported) {
    throw new Error('SVG contains unsupported markup.');
  }
  validateSvgElement(root);
  root.querySelectorAll('*').forEach(validateSvgElement);
  validateSvgWithPurify(root, environment);
};

const validateSvgWithPurify = (root: Element, dom: SnapshotWindow) => {
  const purifier = createDOMPurify(dom);
  const sanitized = purifier.sanitize(root, {
    IN_PLACE: true,
    ADD_TAGS: ['foreignobject', 'style'],
    ADD_ATTR: ['externalresourcesrequired', 'xmlns:xlink'],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
  });
  const unsafe = !sanitized || purifier.removed.length > 0;
  if (unsafe) {
    throw new Error('SVG contains unsafe markup.');
  }
};

const validateSvgElement = (element: Element) => {
  Array.from(element.attributes).forEach((attribute) => {
    const name = attribute.localName.toLowerCase();
    const attributeIsUnsafe = name.startsWith('on') || disallowedAttributes.has(name);
    if (attributeIsUnsafe) throw new Error('SVG contains an active attribute.');
    const remote = urlAttributes.has(name) && !isLocalResource(attribute.value);
    if (remote) {
      throw new Error('SVG contains a remote resource.');
    }
    const hasCss = /url|\\/i.test(attribute.value) || name === 'style';
    if (hasCss) validateCssResources(attribute.value);
  });
  if (element.localName === 'style') validateCssResources(element.textContent ?? '');
};

const validateCssResources = (style: string) => {
  const css = style.replace(/\/\*[^]*?\*\//g, '');
  const resourceFunctions = /url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi;
  const remaining = css.replace(resourceFunctions, (_, double, single, bare) => {
    if (!isLocalResource(double ?? single ?? bare))
      throw new Error('SVG contains a remote resource.');
    return '';
  });
  if (/\\|@\s*import\b|(?:url|image|(?:-webkit-)?image-set|src|expression)\s*\(/i.test(remaining)) {
    throw new Error('SVG contains an unsupported CSS resource.');
  }
};

const isLocalResource = (value: string) =>
  localReference.test(value.trim()) || embeddedResource.test(value.trim());

const toError = (cause: unknown) => (cause instanceof Error ? cause : new Error(String(cause)));
