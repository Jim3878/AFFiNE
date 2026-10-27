import type {
  ColumnDataType,
  DatabaseBlockModel,
} from '@blocksuite/affine-model';
import type { Text } from '@blocksuite/store';

import {
  addProperty,
  deleteColumn,
  getCell,
  updateCell,
  updateProperty,
} from '../../utils/block-utils.js';
import type { RelationPropertyData } from './define.js';
import {
  databaseTitle,
  getStoreOf,
  linkedDocOf,
  relationStoreTick,
  type RelationTarget,
  type WorkspaceHolder,
} from './target.js';

/*
 * Two-way relations. Column A (in database X) relates to database Y. Turning
 * on two-way adds column B to Y with `mirrorOf: A`, and A gets `backlink: B`.
 * Only A's cells are stored: B's value for a row of Y is the rows of X whose A
 * cell holds that row, and editing B rewrites those A cells. So the two sides
 * cannot disagree, and turning two-way off (deleting B) loses nothing.
 */

const entriesOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];

const dataOf = (column?: ColumnDataType): RelationPropertyData =>
  (column?.data ?? {}) as RelationPropertyData;

const columnOf = (database: DatabaseBlockModel, columnId: string) =>
  database.props.columns.find(c => c.id === columnId);

function withoutKey<T extends Record<string, unknown>>(data: T, key: string) {
  const { [key]: _removed, ...rest } = data;
  return rest;
}

/** The doc a row's title links to (rows of imported Notion pages). */
function rowLink(database: DatabaseBlockModel, rowId: string) {
  const row = database.children[database.childMap.value.get(rowId) ?? -1];
  return linkedDocOf((row?.props as { text?: Text } | undefined)?.text);
}

function readDatabase(holder: WorkspaceHolder, target: RelationTarget) {
  return (getStoreOf(holder, target.docId)?.getModelById(target.blockId) ??
    undefined) as DatabaseBlockModel | undefined;
}

/** A writable model of the target database (in this doc or another one). */
function writeDatabase(
  holder: WorkspaceHolder,
  own: DatabaseBlockModel,
  target: RelationTarget
): DatabaseBlockModel | undefined {
  if (target.docId === own.store.id) {
    return (own.store.getModelById(target.blockId) ?? undefined) as
      | DatabaseBlockModel
      | undefined;
  }
  const doc = holder.workspace.getDoc(target.docId);
  if (!doc) return;
  const store = doc.getStore({ id: 'nineday-relation-writer' });
  if (!store.loaded) store.load();
  return (store.getModelById(target.blockId) ?? undefined) as
    | DatabaseBlockModel
    | undefined;
}

/** For a mirror column: the source rows that point at `rowId` (undefined if the source is gone). */
function mirroredEntries(
  holder: WorkspaceHolder,
  own: DatabaseBlockModel,
  rowId: string,
  data: RelationPropertyData
): string[] | undefined {
  const { target, mirrorOf } = data;
  if (!target || !mirrorOf) return;
  void relationStoreTick.value;
  const source = readDatabase(holder, target);
  const sourceColumn = source && columnOf(source, mirrorOf);
  if (!source || sourceColumn?.type !== 'relation') return;
  const link = rowLink(own, rowId);
  return source.children
    .filter(row =>
      entriesOf(getCell(source, row.id, mirrorOf)?.value).some(
        e => e === rowId || (link !== undefined && e === link)
      )
    )
    .map(row => row.id);
}

/** The entries of a relation cell: stored, or computed for a mirror column. */
export function relationEntries(
  holder: WorkspaceHolder,
  own: DatabaseBlockModel,
  rowId: string,
  column: ColumnDataType
): string[] {
  return (
    mirroredEntries(holder, own, rowId, dataOf(column)) ??
    entriesOf(getCell(own, rowId, column.id)?.value)
  );
}

/**
 * Sets the related rows of a mirror cell by rewriting the source column.
 * Returns false if the column is not a live mirror (then store the value as usual).
 */
export function setMirroredEntries(
  holder: WorkspaceHolder,
  own: DatabaseBlockModel,
  rowId: string,
  columnId: string,
  next: string[]
): boolean {
  const data = dataOf(columnOf(own, columnId));
  const { target, mirrorOf } = data;
  if (!target || !mirrorOf || !mirroredEntries(holder, own, rowId, data)) {
    return false;
  }
  const source = writeDatabase(holder, own, target);
  if (!source) return true;
  const link = rowLink(own, rowId);
  const want = new Set(next);
  source.store.transact(() => {
    for (const row of source.children) {
      const entries = entriesOf(getCell(source, row.id, mirrorOf)?.value);
      const has = entries.some(
        e => e === rowId || (link !== undefined && e === link)
      );
      if (has === want.has(row.id)) continue;
      updateCell(source, row.id, {
        columnId: mirrorOf,
        value: has
          ? entries.filter(e => e !== rowId && e !== link)
          : [...entries, rowId],
      });
    }
  });
  return true;
}

/** The live mirror column of `columnId` in its target database, if two-way is on. */
export function backlinkColumn(
  holder: WorkspaceHolder,
  own: DatabaseBlockModel,
  columnId: string
): ColumnDataType | undefined {
  const { target, backlink } = dataOf(columnOf(own, columnId));
  if (!target || !backlink) return;
  const other = readDatabase(holder, target);
  const mirror = other && columnOf(other, backlink);
  return mirror && dataOf(mirror).mirrorOf === columnId ? mirror : undefined;
}

/** For a mirror column: the source column it shows, if it still exists. */
export function mirrorSource(
  holder: WorkspaceHolder,
  own: DatabaseBlockModel,
  columnId: string
): ColumnDataType | undefined {
  const { target, mirrorOf } = dataOf(columnOf(own, columnId));
  if (!target || !mirrorOf) return;
  const source = readDatabase(holder, target);
  return source ? columnOf(source, mirrorOf) : undefined;
}

export function enableTwoWay(
  holder: WorkspaceHolder,
  own: DatabaseBlockModel,
  columnId: string
) {
  const column = columnOf(own, columnId);
  const { target, mirrorOf } = dataOf(column);
  if (!column || !target || mirrorOf || backlinkColumn(holder, own, columnId)) {
    return;
  }
  const other = writeDatabase(holder, own, target);
  if (!other) return;
  const self: RelationTarget = { docId: own.store.id, blockId: own.id };
  // Named after this database; within one database, after the column itself.
  const base =
    target.docId === self.docId && target.blockId === self.blockId
      ? `${column.name} (back)`
      : databaseTitle(holder, self) || 'Related';
  let name = base;
  for (let i = 2; other.props.columns.some(c => c.name === name); i++) {
    name = `${base} ${i}`;
  }
  const mirrorId = addProperty(other, 'end', {
    type: 'relation',
    name,
    data: { target: self, mirrorOf: columnId },
  });
  updateProperty(own, columnId, column => ({
    data: { ...column.data, backlink: mirrorId },
  }));
}

/**
 * Turns two-way off. On the source column this deletes its mirror; on a mirror
 * column it deletes the mirror itself (`deleteOwn`) and clears the source's link.
 */
export function disableTwoWay(
  holder: WorkspaceHolder,
  own: DatabaseBlockModel,
  columnId: string,
  deleteOwn: (columnId: string) => void
) {
  const { target, mirrorOf, backlink } = dataOf(columnOf(own, columnId));
  if (!target) return;
  if (mirrorOf) {
    const source = writeDatabase(holder, own, target);
    if (source && dataOf(columnOf(source, mirrorOf)).backlink === columnId) {
      updateProperty(source, mirrorOf, column => ({
        data: withoutKey(column.data, 'backlink'),
      }));
    }
    deleteOwn(columnId);
    return;
  }
  if (backlink) {
    const other = writeDatabase(holder, own, target);
    const mirror = other && columnOf(other, backlink);
    if (other && mirror && dataOf(mirror).mirrorOf === columnId) {
      deleteColumn(other, mirror.id);
    }
  }
  updateProperty(own, columnId, column => ({
    data: withoutKey(column.data, 'backlink'),
  }));
}

/** Points a (non-mirror) relation column at another database; turns two-way off first. */
export function setRelationTarget(
  holder: WorkspaceHolder,
  own: DatabaseBlockModel,
  columnId: string,
  target: RelationTarget
) {
  const { mirrorOf, backlink } = dataOf(columnOf(own, columnId));
  if (mirrorOf) return;
  if (backlink) disableTwoWay(holder, own, columnId, () => {});
  updateProperty(own, columnId, column => ({
    data: { ...withoutKey(column.data, 'backlink'), target },
  }));
}

/** Cleans up the other side before a relation column is deleted. */
export function beforeRelationDelete(
  holder: WorkspaceHolder,
  own: DatabaseBlockModel,
  columnId: string
) {
  const column = columnOf(own, columnId);
  if (column?.type !== 'relation') return;
  const { mirrorOf, backlink } = dataOf(column);
  if (mirrorOf || backlink) disableTwoWay(holder, own, columnId, () => {});
}
