import { format as formatDateFns } from 'date-fns/format';

import { FormulaError, type FormulaNode } from './parser.js';

/** A row of some database; `prop()` on it reads that row's cells. */
export class RowRef {
  constructor(
    readonly key: string,
    readonly title: string,
    readonly read: (name: string) => FormulaValue
  ) {}
}

export type FormulaValue =
  | null
  | number
  | string
  | boolean
  | Date
  | RowRef
  | FormulaValue[];

export type FormulaScope = {
  /** The row the formula is computed for. */
  row: RowRef;
  vars: Map<string, FormulaValue>;
};

const isList = (v: FormulaValue): v is FormulaValue[] => Array.isArray(v);

export function isEmptyValue(v: FormulaValue): boolean {
  return v === null || v === '' || (isList(v) && v.length === 0);
}

export function valueToText(v: FormulaValue): string {
  if (v === null) return '';
  if (typeof v === 'number') {
    return Number.isFinite(v) ? String(Number(v.toPrecision(12))) : String(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return formatDateFns(v, 'yyyy-MM-dd HH:mm');
  if (v instanceof RowRef) return v.title;
  if (isList(v)) return v.map(valueToText).join(', ');
  return v;
}

function typeName(v: FormulaValue): string {
  if (v === null) return 'empty';
  if (v instanceof Date) return 'date';
  if (v instanceof RowRef) return 'page';
  if (isList(v)) return 'list';
  return typeof v === 'string' ? 'text' : typeof v;
}

function toNumber(v: FormulaValue, where: string): number {
  if (v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') {
    const n = Number(v.trim());
    if (!Number.isNaN(n)) return n;
  }
  throw new FormulaError(`${where} expects a number, got ${typeName(v)}`);
}

function toBoolean(v: FormulaValue): boolean {
  if (isList(v)) return v.length > 0;
  return v !== null && v !== false && v !== 0 && v !== '';
}

function toList(v: FormulaValue): FormulaValue[] {
  if (v === null) return [];
  return isList(v) ? v : [v];
}

function toDate(v: FormulaValue, where: string): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw new FormulaError(`${where} expects a date, got ${typeName(v)}`);
}

function equals(a: FormulaValue, b: FormulaValue): boolean {
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();
  if (a instanceof RowRef && b instanceof RowRef) return a.key === b.key;
  if (isList(a) && isList(b)) {
    return a.length === b.length && a.every((v, i) => equals(v, b[i] ?? null));
  }
  if (typeof a === 'number' && typeof b === 'string') return String(a) === b;
  if (typeof a === 'string' && typeof b === 'number') return a === String(b);
  return a === b;
}

function compare(a: FormulaValue, b: FormulaValue): number {
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b);
  }
  if (a instanceof Date || b instanceof Date) {
    return (
      toDate(a, 'Comparison').getTime() - toDate(b, 'Comparison').getTime()
    );
  }
  return toNumber(a, 'Comparison') - toNumber(b, 'Comparison');
}

const numbersOf = (args: FormulaValue[], where: string) =>
  args.flatMap(toList).map(v => toNumber(v, where));

const UNITS: Record<string, number> = {
  millisecond: 1,
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
};

function unitOf(v: FormulaValue): string {
  const unit = String(v ?? 'days')
    .toLowerCase()
    .replace(/s$/, '');
  return unit;
}

function dateAdd(date: Date, amount: number, unitValue: FormulaValue): Date {
  const unit = unitOf(unitValue);
  const d = new Date(date);
  if (unit === 'year') d.setFullYear(d.getFullYear() + amount);
  else if (unit === 'quarter') d.setMonth(d.getMonth() + amount * 3);
  else if (unit === 'month') d.setMonth(d.getMonth() + amount);
  else if (UNITS[unit]) return new Date(d.getTime() + amount * UNITS[unit]);
  else throw new FormulaError(`Unknown date unit "${unit}"`);
  return d;
}

function dateBetween(a: Date, b: Date, unitValue: FormulaValue): number {
  const unit = unitOf(unitValue);
  const months =
    (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
  if (unit === 'year') return Math.trunc(months / 12);
  if (unit === 'quarter') return Math.trunc(months / 3);
  if (unit === 'month') return months;
  const ms = UNITS[unit];
  if (!ms) throw new FormulaError(`Unknown date unit "${unit}"`);
  return Math.trunc((a.getTime() - b.getTime()) / ms);
}

type Eager = (args: FormulaValue[]) => FormulaValue;
type Lazy = (args: FormulaNode[], scope: FormulaScope) => FormulaValue;

const arity = (name: string, args: unknown[], min: number, max = min) => {
  if (args.length < min || args.length > max) {
    const want = min === max ? `${min}` : `${min}-${max}`;
    throw new FormulaError(`${name}() takes ${want} arguments`);
  }
};

const text = (v: FormulaValue) => valueToText(v);

const EAGER: Record<string, Eager> = {
  // Numbers
  abs: ([x = null]) => Math.abs(toNumber(x, 'abs')),
  ceil: ([x = null]) => Math.ceil(toNumber(x, 'ceil')),
  floor: ([x = null]) => Math.floor(toNumber(x, 'floor')),
  round: ([x = null, places = 0]) => {
    const p = 10 ** toNumber(places, 'round');
    return Math.round(toNumber(x, 'round') * p) / p;
  },
  sqrt: ([x = null]) => Math.sqrt(toNumber(x, 'sqrt')),
  cbrt: ([x = null]) => Math.cbrt(toNumber(x, 'cbrt')),
  pow: ([a = null, b = null]) => toNumber(a, 'pow') ** toNumber(b, 'pow'),
  exp: ([x = null]) => Math.exp(toNumber(x, 'exp')),
  ln: ([x = null]) => Math.log(toNumber(x, 'ln')),
  log10: ([x = null]) => Math.log10(toNumber(x, 'log10')),
  log2: ([x = null]) => Math.log2(toNumber(x, 'log2')),
  sign: ([x = null]) => Math.sign(toNumber(x, 'sign')),
  mod: ([a = null, b = null]) => toNumber(a, 'mod') % toNumber(b, 'mod'),
  add: ([a = null, b = null]) => toNumber(a, 'add') + toNumber(b, 'add'),
  subtract: ([a = null, b = null]) =>
    toNumber(a, 'subtract') - toNumber(b, 'subtract'),
  multiply: ([a = null, b = null]) =>
    toNumber(a, 'multiply') * toNumber(b, 'multiply'),
  divide: ([a = null, b = null]) =>
    toNumber(a, 'divide') / toNumber(b, 'divide'),
  pi: () => Math.PI,
  e: () => Math.E,
  sum: args => numbersOf(args, 'sum').reduce((a, b) => a + b, 0),
  min: args => {
    const n = numbersOf(args, 'min');
    return n.length ? Math.min(...n) : null;
  },
  max: args => {
    const n = numbersOf(args, 'max');
    return n.length ? Math.max(...n) : null;
  },
  mean: args => {
    const n = numbersOf(args, 'mean');
    return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
  },
  median: args => {
    const n = numbersOf(args, 'median').sort((a, b) => a - b);
    if (!n.length) return null;
    const mid = Math.floor(n.length / 2);
    return n.length % 2
      ? (n[mid] as number)
      : ((n[mid - 1] as number) + (n[mid] as number)) / 2;
  },
  toNumber: ([x = null]) => {
    if (x instanceof Date) return x.getTime();
    const n = Number(text(x));
    return Number.isNaN(n) ? null : n;
  },
  // Logic
  not: ([x = null]) => !toBoolean(x),
  empty: ([x = null]) => isEmptyValue(x) || x === 0 || x === false,
  equal: ([a = null, b = null]) => equals(a, b),
  unequal: ([a = null, b = null]) => !equals(a, b),
  // Text
  format: ([x = null]) => text(x),
  concat: args =>
    args.some(isList) ? args.flatMap(toList) : args.map(text).join(''),
  join: ([list = null, sep = '']) => toList(list).map(text).join(text(sep)),
  length: ([x = null]) => (isList(x) ? x.length : text(x).length),
  contains: ([s = null, sub = null]) => text(s).includes(text(sub)),
  includes: ([s = null, x = null]) =>
    isList(s) ? s.some(v => equals(v, x)) : text(s).includes(text(x)),
  lower: ([s = null]) => text(s).toLowerCase(),
  upper: ([s = null]) => text(s).toUpperCase(),
  trim: ([s = null]) => text(s).trim(),
  repeat: ([s = null, n = null]) => text(s).repeat(toNumber(n, 'repeat')),
  replace: ([s = null, pattern = null, by = '']) =>
    text(s).replace(new RegExp(text(pattern)), text(by)),
  replaceAll: ([s = null, pattern = null, by = '']) =>
    text(s).replace(new RegExp(text(pattern), 'g'), text(by)),
  test: ([s = null, pattern = null]) => new RegExp(text(pattern)).test(text(s)),
  split: ([s = null, sep = '']) => text(s).split(text(sep)),
  substring: ([s = null, start = 0, end = null]) =>
    text(s).substring(
      toNumber(start, 'substring'),
      end === null ? undefined : toNumber(end, 'substring')
    ),
  // Lists
  first: ([list = null]) => toList(list)[0] ?? null,
  last: ([list = null]) => toList(list).at(-1) ?? null,
  at: ([list = null, i = null]) => toList(list).at(toNumber(i, 'at')) ?? null,
  slice: ([x = null, start = 0, end = null]) => {
    const e = end === null ? undefined : toNumber(end, 'slice');
    return isList(x)
      ? x.slice(toNumber(start, 'slice'), e)
      : text(x).slice(toNumber(start, 'slice'), e);
  },
  reverse: ([list = null]) => [...toList(list)].reverse(),
  sort: ([list = null]) => [...toList(list)].sort(compare),
  unique: ([list = null]) =>
    toList(list).filter(
      (v, i, all) => all.findIndex(other => equals(v, other)) === i
    ),
  flat: ([list = null]) => toList(list).flatMap(toList),
  count: ([list = null]) => toList(list).filter(v => !isEmptyValue(v)).length,
  // Dates
  now: () => new Date(),
  today: () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  },
  dateAdd: ([d = null, n = null, unit = 'days']) =>
    dateAdd(toDate(d, 'dateAdd'), toNumber(n, 'dateAdd'), unit),
  dateSubtract: ([d = null, n = null, unit = 'days']) =>
    dateAdd(toDate(d, 'dateSubtract'), -toNumber(n, 'dateSubtract'), unit),
  dateBetween: ([a = null, b = null, unit = 'days']) =>
    dateBetween(toDate(a, 'dateBetween'), toDate(b, 'dateBetween'), unit),
  formatDate: ([d = null, fmt = 'yyyy-MM-dd']) => {
    if (d === null) return null;
    // Accept Notion/moment tokens for the common cases.
    const pattern = text(fmt)
      .replace(/YYYY/g, 'yyyy')
      .replace(/YY/g, 'yy')
      .replace(/DD/g, 'dd')
      .replace(/(^|[^D])D($|[^D])/g, '$1d$2');
    return formatDateFns(toDate(d, 'formatDate'), pattern);
  },
  parseDate: ([s = null]) => toDate(s, 'parseDate'),
  timestamp: ([d = null]) => toDate(d, 'timestamp').getTime(),
  fromTimestamp: ([n = null]) => new Date(toNumber(n, 'fromTimestamp')),
  year: ([d = null]) => toDate(d, 'year').getFullYear(),
  month: ([d = null]) => toDate(d, 'month').getMonth() + 1,
  date: ([d = null]) => toDate(d, 'date').getDate(),
  day: ([d = null]) => toDate(d, 'day').getDay(),
  hour: ([d = null]) => toDate(d, 'hour').getHours(),
  minute: ([d = null]) => toDate(d, 'minute').getMinutes(),
  // Pages
  id: ([row = null]) => (row instanceof RowRef ? row.key : null),
};

/** Runs `body` once per list item with `current` / `index` bound. */
function eachItem(
  name: string,
  args: FormulaNode[],
  scope: FormulaScope,
  use: (
    items: FormulaValue[],
    run: (item: FormulaValue, index: number) => FormulaValue
  ) => FormulaValue
): FormulaValue {
  arity(name, args, 2);
  const items = toList(evaluate(args[0] as FormulaNode, scope));
  const body = args[1] as FormulaNode;
  return use(items, (item, index) => {
    const vars = new Map(scope.vars);
    vars.set('current', item);
    vars.set('index', index);
    return evaluate(body, { ...scope, vars });
  });
}

const LAZY: Record<string, Lazy> = {
  if: (args, scope) => {
    arity('if', args, 2, 3);
    return toBoolean(evaluate(args[0] as FormulaNode, scope))
      ? evaluate(args[1] as FormulaNode, scope)
      : args[2]
        ? evaluate(args[2], scope)
        : null;
  },
  ifs: (args, scope) => {
    for (let i = 0; i + 1 < args.length; i += 2) {
      if (toBoolean(evaluate(args[i] as FormulaNode, scope))) {
        return evaluate(args[i + 1] as FormulaNode, scope);
      }
    }
    return args.length % 2 ? evaluate(args.at(-1) as FormulaNode, scope) : null;
  },
  and: (args, scope) => args.every(arg => toBoolean(evaluate(arg, scope))),
  or: (args, scope) => args.some(arg => toBoolean(evaluate(arg, scope))),
  let: (args, scope) => {
    arity('let', args, 3);
    return LAZY.lets?.(args, scope) ?? null;
  },
  lets: (args, scope) => {
    if (args.length < 3 || args.length % 2 === 0) {
      throw new FormulaError('lets() takes name, value pairs and a result');
    }
    const vars = new Map(scope.vars);
    for (let i = 0; i + 1 < args.length; i += 2) {
      const name = args[i] as FormulaNode;
      if (name.kind !== 'name') {
        throw new FormulaError('let() names must be plain words');
      }
      vars.set(
        name.name,
        evaluate(args[i + 1] as FormulaNode, { ...scope, vars })
      );
    }
    return evaluate(args.at(-1) as FormulaNode, { ...scope, vars });
  },
  map: (args, scope) =>
    eachItem('map', args, scope, (items, run) => items.map(run)),
  filter: (args, scope) =>
    eachItem('filter', args, scope, (items, run) =>
      items.filter((item, i) => toBoolean(run(item, i)))
    ),
  find: (args, scope) =>
    eachItem(
      'find',
      args,
      scope,
      (items, run) => items.find((item, i) => toBoolean(run(item, i))) ?? null
    ),
  findIndex: (args, scope) =>
    eachItem('findIndex', args, scope, (items, run) =>
      items.findIndex((item, i) => toBoolean(run(item, i)))
    ),
  some: (args, scope) =>
    eachItem('some', args, scope, (items, run) =>
      items.some((item, i) => toBoolean(run(item, i)))
    ),
  every: (args, scope) =>
    eachItem('every', args, scope, (items, run) =>
      items.every((item, i) => toBoolean(run(item, i)))
    ),
  prop: (args, scope) => {
    arity('prop', args, 1, 2);
    const row =
      args.length === 2 ? evaluate(args[0] as FormulaNode, scope) : scope.row;
    const name = text(evaluate(args.at(-1) as FormulaNode, scope));
    if (row === null) return null;
    if (!(row instanceof RowRef)) {
      throw new FormulaError(
        `prop("${name}") needs a page, got ${typeName(row)}`
      );
    }
    return row.read(name);
  },
};

/** Names of all functions, for the editor's hints. */
export const FORMULA_FUNCTIONS = [...Object.keys(LAZY), ...Object.keys(EAGER)];

function binary(op: string, a: FormulaValue, b: FormulaValue): FormulaValue {
  switch (op) {
    case '+':
      if (isList(a) || isList(b)) return [...toList(a), ...toList(b)];
      if (typeof a === 'string' || typeof b === 'string')
        return text(a) + text(b);
      if (a instanceof Date || b instanceof Date) {
        throw new FormulaError('Use dateAdd() to add to a date');
      }
      return toNumber(a, '+') + toNumber(b, '+');
    case '-':
      return toNumber(a, '-') - toNumber(b, '-');
    case '*':
      return toNumber(a, '*') * toNumber(b, '*');
    case '/':
      return toNumber(a, '/') / toNumber(b, '/');
    case '%':
      return toNumber(a, '%') % toNumber(b, '%');
    case '^':
      return toNumber(a, '^') ** toNumber(b, '^');
    case '==':
      return equals(a, b);
    case '!=':
      return !equals(a, b);
    case '>':
      return compare(a, b) > 0;
    case '>=':
      return compare(a, b) >= 0;
    case '<':
      return compare(a, b) < 0;
    case '<=':
      return compare(a, b) <= 0;
  }
  throw new FormulaError(`Unknown operator "${op}"`);
}

export function evaluate(node: FormulaNode, scope: FormulaScope): FormulaValue {
  switch (node.kind) {
    case 'number':
    case 'string':
    case 'boolean':
      return node.value;
    case 'list':
      return node.items.map(item => evaluate(item, scope));
    case 'name': {
      if (scope.vars.has(node.name)) {
        return scope.vars.get(node.name) ?? null;
      }
      if (node.name === 'current' || node.name === 'index') {
        throw new FormulaError(
          `"${node.name}" only works inside map(), filter() and similar`
        );
      }
      const zeroArg = EAGER[node.name];
      if (zeroArg && ['pi', 'e', 'now', 'today'].includes(node.name)) {
        return zeroArg([]);
      }
      throw new FormulaError(
        `Unknown name "${node.name}". Use prop("${node.name}") for a property, or quotes for text`
      );
    }
    case 'unary': {
      const v = evaluate(node.arg, scope);
      if (node.op === '!') return !toBoolean(v);
      return node.op === '-' ? -toNumber(v, '-') : toNumber(v, '+');
    }
    case 'binary': {
      if (node.op === '&&') {
        return (
          toBoolean(evaluate(node.left, scope)) &&
          toBoolean(evaluate(node.right, scope))
        );
      }
      if (node.op === '||') {
        return (
          toBoolean(evaluate(node.left, scope)) ||
          toBoolean(evaluate(node.right, scope))
        );
      }
      return binary(
        node.op,
        evaluate(node.left, scope),
        evaluate(node.right, scope)
      );
    }
    case 'conditional':
      return toBoolean(evaluate(node.test, scope))
        ? evaluate(node.consequent, scope)
        : evaluate(node.otherwise, scope);
    case 'call': {
      const lazy = LAZY[node.name];
      if (lazy) return lazy(node.args, scope);
      const eager = EAGER[node.name];
      if (!eager) throw new FormulaError(`Unknown function "${node.name}"`);
      return eager(node.args.map(arg => evaluate(arg, scope)));
    }
  }
}
