import { describe, expect, test } from 'vitest';

import { containsMarkdownTable } from '../clipboard/utils.js';

describe('containsMarkdownTable', () => {
  test('a header and a delimiter row make a table', () => {
    expect(containsMarkdownTable('| a | b |\n| --- | --- |\n| 1 | 2 |')).toBe(
      true
    );
    expect(containsMarkdownTable('a | b\n:-- | --:')).toBe(true);
    expect(containsMarkdownTable('| a |\n| --- |')).toBe(true);
  });

  test('finds a table after other lines and with CRLF', () => {
    expect(
      containsMarkdownTable('# Title\r\n\r\n| a | b |\r\n|---|---|\r\n')
    ).toBe(true);
  });

  test('plain text with pipes or rules is not a table', () => {
    expect(containsMarkdownTable('a | b\nc | d')).toBe(false);
    expect(containsMarkdownTable('text\n---')).toBe(false);
    expect(containsMarkdownTable('---|---')).toBe(false);
  });

  test('the delimiter needs as many cells as the header', () => {
    expect(containsMarkdownTable('| a | b | c |\n| --- | --- |')).toBe(false);
  });
});
