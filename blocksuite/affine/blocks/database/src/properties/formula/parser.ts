/**
 * Parser for Notion-style formulas, e.g.
 *   prop("Price") * prop("Qty")
 *   if(prop("Done"), "✅", "⏳")
 *   prop("Items").map(current.prop("Price")).sum()
 * `a.f(b)` is the same call as `f(a, b)`.
 */

export class FormulaError extends Error {}

export type FormulaNode =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'list'; items: FormulaNode[] }
  | { kind: 'name'; name: string }
  | { kind: 'call'; name: string; args: FormulaNode[] }
  | { kind: 'unary'; op: string; arg: FormulaNode }
  | { kind: 'binary'; op: string; left: FormulaNode; right: FormulaNode }
  | {
      kind: 'conditional';
      test: FormulaNode;
      consequent: FormulaNode;
      otherwise: FormulaNode;
    };

type Token =
  | { type: 'number'; value: number; pos: number }
  | { type: 'string'; value: string; pos: number }
  | { type: 'name'; value: string; pos: number }
  | { type: 'op'; value: string; pos: number }
  | { type: 'end'; value: ''; pos: number };

const OPERATORS = [
  '===',
  '!==',
  '==',
  '!=',
  '>=',
  '<=',
  '&&',
  '||',
  '>',
  '<',
  '+',
  '-',
  '*',
  '/',
  '%',
  '^',
  '!',
  '?',
  ':',
  '(',
  ')',
  '[',
  ']',
  ',',
  '.',
];

const isNameStart = (c: string) => /[\p{L}_$]/u.test(c);
const isNamePart = (c: string) => /[\p{L}\p{N}_$]/u.test(c);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i] as string;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const start = i;
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      const match = /^(\d*\.?\d+|\d+\.)(e[+-]?\d+)?/i.exec(source.slice(i));
      const text = match?.[0] ?? c;
      tokens.push({ type: 'number', value: Number(text), pos: start });
      i += text.length;
      continue;
    }
    if (c === '"' || c === "'" || c === '“' || c === '”') {
      const close = c === '“' ? '”' : c;
      let value = '';
      i++;
      while (i < source.length && source[i] !== close) {
        if (source[i] === '\\' && i + 1 < source.length) {
          const next = source[i + 1] as string;
          value += next === 'n' ? '\n' : next === 't' ? '\t' : next;
          i += 2;
        } else {
          value += source[i];
          i++;
        }
      }
      if (i >= source.length) {
        throw new FormulaError(`Unclosed string starting at ${start + 1}`);
      }
      i++;
      tokens.push({ type: 'string', value, pos: start });
      continue;
    }
    if (isNameStart(c)) {
      while (i < source.length && isNamePart(source[i] as string)) i++;
      tokens.push({ type: 'name', value: source.slice(start, i), pos: start });
      continue;
    }
    const op = OPERATORS.find(o => source.startsWith(o, i));
    if (!op) {
      throw new FormulaError(`Unexpected "${c}" at ${start + 1}`);
    }
    tokens.push({ type: 'op', value: op, pos: start });
    i += op.length;
  }
  tokens.push({ type: 'end', value: '', pos: source.length });
  return tokens;
}

// Binary operators from lowest to highest precedence.
const BINARY_LEVELS: string[][] = [
  ['or', '||'],
  ['and', '&&'],
  ['==', '!=', '===', '!=='],
  ['>', '>=', '<', '<='],
  ['+', '-'],
  ['*', '/', '%'],
];

const NORMALIZE: Record<string, string> = {
  or: '||',
  and: '&&',
  '===': '==',
  '!==': '!=',
};

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  private get token(): Token {
    return this.tokens[this.index] as Token;
  }

  private isOp(value: string) {
    const t = this.token;
    return (
      (t.type === 'op' && t.value === value) ||
      (t.type === 'name' && t.value === value && /^[a-z]+$/.test(value))
    );
  }

  private expect(value: string) {
    if (!this.isOp(value)) {
      throw this.unexpected(`Expected "${value}"`);
    }
    this.index++;
  }

  private unexpected(message = 'Unexpected') {
    const t = this.token;
    return t.type === 'end'
      ? new FormulaError(`${message} but the formula ended`)
      : new FormulaError(`${message} at ${t.pos + 1}: "${t.value}"`);
  }

  parse(): FormulaNode {
    const node = this.conditional();
    if (this.token.type !== 'end') {
      throw this.unexpected();
    }
    return node;
  }

  private conditional(): FormulaNode {
    const test = this.binary(0);
    if (!this.isOp('?')) return test;
    this.index++;
    const consequent = this.conditional();
    this.expect(':');
    const otherwise = this.conditional();
    return { kind: 'conditional', test, consequent, otherwise };
  }

  private binary(level: number): FormulaNode {
    if (level >= BINARY_LEVELS.length) return this.power();
    let left = this.binary(level + 1);
    const ops = BINARY_LEVELS[level] as string[];
    while (ops.some(op => this.isOp(op))) {
      const op = String(this.token.value);
      this.index++;
      const right = this.binary(level + 1);
      left = { kind: 'binary', op: NORMALIZE[op] ?? op, left, right };
    }
    return left;
  }

  private power(): FormulaNode {
    const base = this.unary();
    if (!this.isOp('^')) return base;
    this.index++;
    // Right associative: 2 ^ 3 ^ 2 = 2 ^ 9.
    return { kind: 'binary', op: '^', left: base, right: this.power() };
  }

  private unary(): FormulaNode {
    if (
      this.isOp('-') ||
      this.isOp('+') ||
      this.isOp('!') ||
      this.isOp('not')
    ) {
      const op = this.token.value === 'not' ? '!' : String(this.token.value);
      this.index++;
      return { kind: 'unary', op, arg: this.unary() };
    }
    return this.postfix();
  }

  private postfix(): FormulaNode {
    let node = this.primary();
    while (this.isOp('.')) {
      this.index++;
      const name = this.token;
      if (name.type !== 'name') {
        throw this.unexpected('Expected a function name after "."');
      }
      this.index++;
      const args = this.isOp('(') ? this.callArgs() : [];
      node = { kind: 'call', name: name.value, args: [node, ...args] };
    }
    return node;
  }

  private callArgs(): FormulaNode[] {
    this.expect('(');
    const args: FormulaNode[] = [];
    if (!this.isOp(')')) {
      args.push(this.conditional());
      while (this.isOp(',')) {
        this.index++;
        args.push(this.conditional());
      }
    }
    this.expect(')');
    return args;
  }

  private primary(): FormulaNode {
    const t = this.token;
    if (t.type === 'number') {
      this.index++;
      return { kind: 'number', value: t.value };
    }
    if (t.type === 'string') {
      this.index++;
      return { kind: 'string', value: t.value };
    }
    if (t.type === 'name') {
      this.index++;
      if (t.value === 'true' || t.value === 'false') {
        return { kind: 'boolean', value: t.value === 'true' };
      }
      if (this.isOp('(')) {
        return { kind: 'call', name: t.value, args: this.callArgs() };
      }
      return { kind: 'name', name: t.value };
    }
    if (this.isOp('(')) {
      this.index++;
      const node = this.conditional();
      this.expect(')');
      return node;
    }
    if (this.isOp('[')) {
      this.index++;
      const items: FormulaNode[] = [];
      if (!this.isOp(']')) {
        items.push(this.conditional());
        while (this.isOp(',')) {
          this.index++;
          items.push(this.conditional());
        }
      }
      this.expect(']');
      return { kind: 'list', items };
    }
    throw this.unexpected();
  }
}

const cache = new Map<string, FormulaNode>();

/** Parses a formula (cached by source); throws FormulaError on bad syntax. */
export function parseFormula(source: string): FormulaNode {
  let node = cache.get(source);
  if (!node) {
    node = new Parser(tokenize(source)).parse();
    if (cache.size > 500) cache.clear();
    cache.set(source, node);
  }
  return node;
}
