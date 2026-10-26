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
  textDecoration: 'underline',
  textDecorationColor: 'var(--affine-divider-color)',
  ':hover': {
    textDecorationColor: 'var(--affine-icon-color)',
  },
});

export const relationMissingStyle = css({
  color: 'var(--affine-text-disable-color)',
  cursor: 'default',
  textDecoration: 'line-through',
});
