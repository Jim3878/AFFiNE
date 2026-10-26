import type {
  ColumnDataType,
  DatabaseBlockModel,
} from '@blocksuite/affine-model';
import type { SelectTag } from '@blocksuite/data-view';
import type { BlockModel, Text } from '@blocksuite/store';

import { getCell } from '../../utils/block-utils.js';
import {
  getStoreOf,
  listRows,
  resolveEntry,
  textTitle,
  type WorkspaceHolder,
} from '../relation/target.js';
import {
  evaluate,
  type FormulaValue,
  RowRef,
  valueToText,
} from './evaluate.js';
import { FormulaError, parseFormula } from './parser.js';

export type FormulaResultType = 'number' | 'text' | 'boolean' | 'date' | 'list';

/** What a formula cell holds: computed on read, never stored. */
export type FormulaResult =
  | { type: 'number'; value: number }
  | { type: 'text'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'date'; value: number }
  | { type: 'list'; value: string[] }
  | { type: 'empty' }
  | { type: 'error'; message: string };

export type FormulaPropertyData = {
  expression: string;
  /** Type of the results, found when the formula is saved; drives sort/filter. */
  resultType: FormulaResultType;
};

/** Formula cells being computed right now, to catch formulas that use themselves. */
const computing = new Set<string>();

function rowModel(
  database: DatabaseBlockModel,
  rowId: string
): BlockModel | undefined {
  return database.children[database.childMap.value.get(rowId) ?? -1];
}

function findColumn(
  database: DatabaseBlockModel,
  name: string
): ColumnDataType | undefined {
  const columns = database.props.columns$.value;
  const key = name.trim().toLowerCase();
  return (
    columns.find(c => c.name === name) ??
    columns.find(c => c.name.trim().toLowerCase() === key)
  );
}

export function rowRef(
  holder: WorkspaceHolder,
  database: DatabaseBlockModel,
  rowId: string
): RowRef {
  const text = (rowModel(database, rowId)?.props as { text?: Text } | undefined)
    ?.text;
  return new RowRef(rowId, textTitle(holder, text) || 'Untitled', name =>
    readCell(holder, database, rowId, name)
  );
}

function docRef(holder: WorkspaceHolder, docId: string): RowRef {
  const title = holder.workspace.meta.getDocMeta(docId)?.title || 'Untitled';
  return new RowRef(docId, title, () => null);
}

function readRelation(
  holder: WorkspaceHolder,
  column: ColumnDataType,
  value: unknown
): FormulaValue {
  const entries = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
  const target = (
    column.data as { target?: { docId: string; blockId: string } }
  ).target;
  if (!target) {
    return entries.map(docId => docRef(holder, docId));
  }
  const rows = listRows(holder, target);
  const database = getStoreOf(holder, target.docId)?.getModelById(
    target.blockId
  ) as DatabaseBlockModel | null | undefined;
  if (!rows || !database) return [];
  return entries.flatMap(entry => {
    const row = resolveEntry(rows, entry);
    return row ? [rowRef(holder, database, row.id)] : [];
  });
}

function resultToValue(result: FormulaResult, name: string): FormulaValue {
  switch (result.type) {
    case 'empty':
      return null;
    case 'error':
      throw new FormulaError(`prop("${name}") has an error: ${result.message}`);
    case 'date':
      return new Date(result.value);
    default:
      return result.value;
  }
}

function readCell(
  holder: WorkspaceHolder,
  database: DatabaseBlockModel,
  rowId: string,
  name: string
): FormulaValue {
  const column = findColumn(database, name);
  const row = rowModel(database, rowId);
  // The built-in title property is not always in `columns` (then it is "Title").
  const isTitle =
    column?.type === 'title' ||
    (!column && name.trim().toLowerCase() === 'title');
  if (isTitle) {
    return textTitle(holder, (row?.props as { text?: Text } | undefined)?.text);
  }
  if (!column) {
    throw new FormulaError(`No property named "${name}"`);
  }
  if (column.type === 'created-time') {
    const at = (row?.props as Record<string, unknown> | undefined)?.[
      'meta:createdAt'
    ];
    return typeof at === 'number' ? new Date(at) : null;
  }
  if (column.type === 'formula') {
    return resultToValue(
      computeFormula(holder, database, rowId, column.id),
      name
    );
  }
  const value = getCell(database, rowId, column.id)?.value;
  switch (column.type) {
    case 'number':
    case 'progress':
      return typeof value === 'number' ? value : null;
    case 'checkbox':
      return !!value;
    case 'date':
      return typeof value === 'number' ? new Date(value) : null;
    case 'select': {
      const options = (column.data as { options?: SelectTag[] }).options ?? [];
      return options.find(o => o.id === value)?.value ?? null;
    }
    case 'multi-select': {
      const options = (column.data as { options?: SelectTag[] }).options ?? [];
      return (Array.isArray(value) ? value : []).flatMap(id => {
        const option = options.find(o => o.id === id);
        return option ? [option.value] : [];
      });
    }
    case 'relation':
      return readRelation(holder, column, value);
    case 'rich-text':
    case 'link':
      return value == null ? null : String(value);
    default:
      return null;
  }
}

export function toFormulaResult(value: FormulaValue): FormulaResult {
  if (value === null) return { type: 'empty' };
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { type: 'number', value }
      : { type: 'error', message: 'Not a number (division by zero?)' };
  }
  if (typeof value === 'boolean') return { type: 'boolean', value };
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { type: 'error', message: 'Invalid date' }
      : { type: 'date', value: value.getTime() };
  }
  if (Array.isArray(value)) {
    return { type: 'list', value: value.map(valueToText) };
  }
  return { type: 'text', value: valueToText(value) };
}

/**
 * Computes the formula of column `columnId` for one row (or `expression`
 * instead of the column's own, for the editor preview).
 */
export function computeFormula(
  holder: WorkspaceHolder,
  database: DatabaseBlockModel,
  rowId: string,
  columnId: string,
  expression?: string
): FormulaResult {
  const column = database.props.columns$.value.find(c => c.id === columnId);
  const source =
    expression ??
    (column?.data as Partial<FormulaPropertyData> | undefined)?.expression ??
    '';
  if (!source.trim()) return { type: 'empty' };
  const key = `${database.id}/${rowId}/${columnId}`;
  if (computing.has(key)) {
    return { type: 'error', message: 'The formula uses itself' };
  }
  computing.add(key);
  try {
    const node = parseFormula(source);
    return toFormulaResult(
      evaluate(node, {
        row: rowRef(holder, database, rowId),
        vars: new Map(),
      })
    );
  } catch (e) {
    return {
      type: 'error',
      message: e instanceof Error ? e.message : String(e),
    };
  } finally {
    computing.delete(key);
  }
}

export function formulaResultText(result: FormulaResult | undefined): string {
  if (!result) return '';
  switch (result.type) {
    case 'empty':
      return '';
    case 'error':
      return `Error: ${result.message}`;
    case 'number':
      return valueToText(result.value);
    case 'boolean':
      return result.value ? 'true' : 'false';
    case 'date':
      return valueToText(new Date(result.value));
    case 'list':
      return result.value.join(', ');
    case 'text':
      return result.value;
  }
}

/** The result type a formula produces, judged from the rows it was computed for. */
export function inferResultType(results: FormulaResult[]): FormulaResultType {
  for (const result of results) {
    if (result.type !== 'empty' && result.type !== 'error') {
      return result.type;
    }
  }
  return 'text';
}
