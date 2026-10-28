/**
 * NineDay: the title of a synced doc in edgeless can be enlarged, like the text of
 * a shape. The size is stored on the block (`titleFontSize`); unset keeps the
 * default small secondary title. The header grows with the title, so the folded
 * height of the block follows it too.
 */

/** Value of the "Auto" entry: no size stored (the default small title). */
export const SYNCED_DOC_DEFAULT_TITLE_SIZE = 0;

export const SYNCED_DOC_TITLE_SIZES = [
  { key: 'Auto', value: SYNCED_DOC_DEFAULT_TITLE_SIZE },
  { value: 16 },
  { value: 24 },
  { value: 32 },
  { value: 40 },
  { value: 64 },
  { value: 128 },
] as const;

export const SYNCED_DOC_TITLE_SIZE_MIN = 8;
export const SYNCED_DOC_TITLE_SIZE_MAX = 200;

/** Line height of the header title, in px. */
export function syncedDocTitleLineHeight(titleFontSize?: number) {
  return titleFontSize ? Math.ceil(titleFontSize * 1.3) : 24;
}

// Header layout (edgeless-block-header.css.ts in the app): 8px padding around a
// row of 32px buttons and the title, which has 4px padding of its own.
const HEADER_PADDING = 8;
const BUTTON_HEIGHT = 32;
const TITLE_PADDING = 4;

/** Height of the edgeless header, unscaled: the folded height of the block. */
export function syncedDocHeaderHeight(titleFontSize?: number) {
  const title = syncedDocTitleLineHeight(titleFontSize) + 2 * TITLE_PADDING;
  return 2 * HEADER_PADDING + Math.max(BUTTON_HEIGHT, title);
}
