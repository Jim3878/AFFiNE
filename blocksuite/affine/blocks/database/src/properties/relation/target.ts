import type { BlockStdScope } from '@blocksuite/std';
import type { BlockModel, Store, Text } from '@blocksuite/store';
import { signal } from '@preact/signals-core';

import { isLinkedDoc } from '../../utils/title-doc.js';

/** The database a relation column points at: a database block in some doc. */
export type RelationTarget = { docId: string; blockId: string };

export type RelationRow = {
  /** Row block id inside the target database. */
  id: string;
  title: string;
  /** Doc the row title links to (AFFiNE's "row as doc"), if any. */
  docId?: string;
};

/**
 * Bumped whenever a store we read changes (it may still be loading when first
 * asked), so cells and pickers that read it through signals re-render.
 */
export const relationStoreTick = signal(0);

const stores = new WeakMap<object, Map<string, Store>>();

/** Readonly store of another doc, loaded on demand and cached per workspace. */
export function getStoreOf(
  std: BlockStdScope,
  docId: string
): Store | undefined {
  const workspace = std.workspace;
  const doc = workspace.getDoc(docId);
  if (!doc || doc.meta?.trash) return undefined;
  let cache = stores.get(workspace);
  if (!cache) {
    cache = new Map();
    stores.set(workspace, cache);
  }
  let store = cache.get(docId);
  if (!store) {
    store = doc.getStore({ readonly: true });
    const bump = () => {
      relationStoreTick.value++;
    };
    store.slots.rootAdded.subscribe(bump);
    store.slots.blockUpdated.subscribe(bump);
    cache.set(docId, store);
  }
  if (!store.loaded) {
    store.load();
  }
  return store;
}

/** Plain text of a title, with linked docs shown by their titles. */
export function textTitle(std: BlockStdScope, text?: Text): string {
  if (!text) return '';
  return text.deltas$.value
    .map(delta =>
      isLinkedDoc(delta)
        ? (std.workspace.meta.getDocMeta(
            delta.attributes?.reference?.pageId as string
          )?.title ?? '')
        : (delta.insert ?? '')
    )
    .join('')
    .trim();
}

function linkedDocOf(text?: Text): string | undefined {
  const delta = text?.deltas$.value.find(d => isLinkedDoc(d));
  return delta?.attributes?.reference?.pageId as string | undefined;
}

/** Database blocks in a doc (undefined while the doc is still loading). */
export function listDatabases(
  std: BlockStdScope,
  docId: string
): { blockId: string; title: string }[] | undefined {
  const store = getStoreOf(std, docId);
  if (!store?.root) return undefined;
  return store.getModelsByFlavour('affine:database').map(model => ({
    blockId: model.id,
    title: textTitle(std, (model.props as { title?: Text }).title),
  }));
}

/** Rows of the target database (undefined while loading or if it is gone). */
export function listRows(
  std: BlockStdScope,
  target: RelationTarget
): RelationRow[] | undefined {
  // Read the tick so callers inside computed()/render re-run when data arrives.
  void relationStoreTick.value;
  const store = getStoreOf(std, target.docId);
  if (!store?.root) return undefined;
  const database = store.getModelById(target.blockId);
  if (!database) return undefined;
  return database.children.map((row: BlockModel) => {
    const text = (row.props as { text?: Text }).text;
    return {
      id: row.id,
      title: textTitle(std, text) || 'Untitled',
      docId: linkedDocOf(text),
    };
  });
}

export function databaseTitle(
  std: BlockStdScope,
  target: RelationTarget
): string {
  const docTitle = std.workspace.meta.getDocMeta(target.docId)?.title;
  const db = listDatabases(std, target.docId)?.find(
    d => d.blockId === target.blockId
  );
  return db?.title || docTitle || 'Untitled';
}

/**
 * A stored entry is a row id; older values (and Text -> Relation conversions)
 * may hold a doc id instead, which maps to the row whose title links that doc.
 */
export function resolveEntry(
  rows: RelationRow[],
  entry: string
): RelationRow | undefined {
  return rows.find(r => r.id === entry) ?? rows.find(r => r.docId === entry);
}
