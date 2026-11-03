import { describe, expect, test } from 'vitest';

import { toMarkdownTable } from '../../utils/markdown-table.js';

describe('toMarkdownTable', () => {
  test('the first row is the header', () => {
    expect(
      toMarkdownTable([
        ['名稱', '數量'],
        ['蘋果', '3'],
      ])
    ).toBe('| 名稱 | 數量 |\n| --- | --- |\n| 蘋果 | 3 |');
  });

  test('escapes pipes and keeps a cell on one line', () => {
    expect(toMarkdownTable([['a|b', 'line 1\nline 2']])).toBe(
      '| a\\|b | line 1 line 2 |\n| --- | --- |'
    );
  });

  test('pads short rows', () => {
    expect(toMarkdownTable([['a', 'b'], ['c']])).toBe(
      '| a | b |\n| --- | --- |\n| c |  |'
    );
  });

  test('nothing to format', () => {
    expect(toMarkdownTable([])).toBe('');
    expect(toMarkdownTable([[]])).toBe('');
  });
});
