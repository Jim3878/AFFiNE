import type { RootContentMap } from 'hast';

type HastUnionType<
  K extends keyof RootContentMap,
  V extends RootContentMap[K],
> = V;

export function onlyContainImgElement(
  ast: HastUnionType<keyof RootContentMap, RootContentMap[keyof RootContentMap]>
): 'yes' | 'no' | 'maybe' {
  if (ast.type === 'element') {
    switch (ast.tagName) {
      case 'html':
      case 'body':
        return ast.children.map(onlyContainImgElement).reduce((a, b) => {
          if (a === 'no' || b === 'no') {
            return 'no';
          }
          if (a === 'maybe' && b === 'maybe') {
            return 'maybe';
          }
          return 'yes';
        }, 'maybe');
      case 'img':
        return 'yes';
      case 'head':
        return 'maybe';
      default:
        return 'no';
    }
  }
  return 'maybe';
}

// NineDay: a GFM table delimiter row, e.g. `| --- | :-: |` or `---|---`.
const MARKDOWN_TABLE_DELIMITER =
  /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$|^\s*\|\s*:?-+:?\s*\|\s*$/;

/**
 * NineDay: whether plain text holds a Markdown (GFM) table: a header row with
 * a `|` followed by a delimiter row with as many cells.
 */
export function containsMarkdownTable(text: string) {
  const lines = text.split(/\r?\n/);
  // Escaped pipes (`\|`) are cell text, not separators.
  const cellCount = (line: string) =>
    line
      .replaceAll('\\|', '')
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|').length;
  for (let i = 1; i < lines.length; i++) {
    const header = lines[i - 1];
    const delimiter = lines[i];
    if (!header.includes('|') || !MARKDOWN_TABLE_DELIMITER.test(delimiter)) {
      continue;
    }
    if (cellCount(header) === cellCount(delimiter)) return true;
  }
  return false;
}
