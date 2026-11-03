/**
 * NineDay: format rows of cell text as a Markdown (GFM) table. The first row
 * is the header. `|` is escaped and line breaks become spaces, since a cell
 * has to stay on one line. Rows shorter than the widest one are padded.
 */
export function toMarkdownTable(rows: string[][]) {
  const width = Math.max(0, ...rows.map(row => row.length));
  if (rows.length === 0 || width === 0) return '';

  const formatRow = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, i) =>
      (cells[i] ?? '').replace(/\r?\n/g, ' ').replaceAll('|', '\\|')
    ).join(' | ')} |`;

  return [
    formatRow(rows[0]),
    formatRow(Array.from({ length: width }, () => '---')),
    ...rows.slice(1).map(formatRow),
  ].join('\n');
}
