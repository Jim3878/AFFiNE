import { css } from '@emotion/css';

export const relationCellStyle = css({
  width: '100%',
  height: '100%',
  userSelect: 'none',
  position: 'relative',
});

export const relationListStyle = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '4px',
  width: '100%',
  minHeight: '100%',
  fontSize: 'var(--data-view-cell-text-size)',
  lineHeight: 'var(--data-view-cell-text-line-height)',
});

export const relationChipStyle = css({
  display: 'inline-flex',
  alignItems: 'center',
  maxWidth: '100%',
  padding: '0 6px',
  borderRadius: '4px',
  background: 'var(--affine-hover-color)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  border: '1px solid var(--affine-border-color)',
  ':hover': {
    background: 'var(--affine-hover-color-filled)',
  },
});

export const relationMissingStyle = css({
  color: 'var(--affine-text-disable-color)',
  cursor: 'default',
  textDecoration: 'line-through',
  ':hover': {
    background: 'var(--affine-hover-color)',
  },
});

/**
 * Scrollable list inside the picker menu: the shared menu caps its own height
 * (700px) but its body does not scroll, so long lists would spill out of it.
 */
export const relationPickerListStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  // The picker's size() middleware sets the variable to the space left on screen.
  maxHeight: 'min(360px, var(--relation-picker-max-height, 360px))',
  overflowY: 'auto',
});
