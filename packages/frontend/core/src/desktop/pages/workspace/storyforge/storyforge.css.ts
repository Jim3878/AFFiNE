import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  height: '100%',
  width: '100%',
  overflow: 'auto',
  padding: '16px 24px 80px',
  color: cssVarV2('text/primary'),
  fontSize: 14,
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '0 16px',
  fontWeight: 600,
});

export const toolbar = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 12,
  flexWrap: 'wrap',
});

export const pill = style({
  fontSize: 12,
  padding: '2px 10px',
  borderRadius: 11,
  background: cssVarV2('layer/background/secondary'),
  color: cssVarV2('text/secondary'),
});

export const search = style({
  height: 30,
  padding: '0 10px',
  borderRadius: 6,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  background: cssVarV2('layer/background/primary'),
  color: cssVarV2('text/primary'),
  minWidth: 240,
});

export const chapter = style({
  marginTop: 18,
  marginBottom: 6,
  fontWeight: 600,
  color: cssVarV2('text/secondary'),
});

export const listItem = style({
  display: 'flex',
  gap: 10,
  padding: '6px 10px',
  borderRadius: 6,
  color: cssVarV2('text/primary'),
  textDecoration: 'none',
  selectors: {
    '&:hover': { background: cssVarV2('layer/background/hoverOverlay') },
  },
});

export const muted = style({ color: cssVarV2('text/secondary'), fontSize: 12 });

export const empty = style({ color: cssVarV2('text/secondary'), padding: 24 });

export const table = style({
  borderCollapse: 'collapse',
  width: '100%',
  tableLayout: 'fixed',
});

globalStyle(`${table} th`, {
  position: 'sticky',
  top: -16,
  zIndex: 2,
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 13,
  padding: '8px 6px',
  background: cssVarV2('layer/background/secondary'),
  borderBottom: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
});

globalStyle(`${table} td`, {
  borderBottom: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  verticalAlign: 'top',
  padding: 0,
});

export const rowNumber = style({
  color: cssVarV2('text/secondary'),
  fontSize: 12,
  padding: '8px 6px !important',
  whiteSpace: 'nowrap',
});

export const rowActions = style({
  display: 'flex',
  gap: 2,
  opacity: 0,
  padding: '4px 2px',
  selectors: { 'tr:hover &': { opacity: 1 } },
});

export const iconButton = style({
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: cssVarV2('text/secondary'),
  fontSize: 12,
  padding: '2px 4px',
  borderRadius: 4,
  selectors: {
    '&:hover': { background: cssVarV2('layer/background/hoverOverlay') },
  },
});

export const cell = style({
  position: 'relative',
  minHeight: 34,
  padding: '7px 6px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  cursor: 'text',
  outlineOffset: -2,
});

export const cellInvalid = style({
  background: cssVarV2('layer/background/error'),
  boxShadow: `inset 0 0 0 1px ${cssVarV2('status/error')}`,
});

export const cellEditor = style({
  display: 'block',
  width: '100%',
  minHeight: 34,
  boxSizing: 'border-box',
  padding: '7px 6px',
  border: 'none',
  outline: `2px solid ${cssVarV2('button/primary')}`,
  outlineOffset: -2,
  background: cssVarV2('layer/background/primary'),
  color: cssVarV2('text/primary'),
  font: 'inherit',
  resize: 'none',
  overflow: 'hidden',
});

export const remoteLabel = style({
  position: 'absolute',
  top: -9,
  right: 2,
  zIndex: 3,
  fontSize: 10,
  lineHeight: '14px',
  padding: '0 5px',
  borderRadius: 3,
  color: '#fff',
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
});

export const avatars = style({ display: 'flex', gap: 4, marginLeft: 'auto' });

export const avatar = style({
  width: 24,
  height: 24,
  borderRadius: 12,
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const addRow = style({
  marginTop: 8,
  border: `1px dashed ${cssVarV2('layer/insideBorder/border')}`,
  background: 'transparent',
  color: cssVarV2('text/secondary'),
  padding: '6px 12px',
  borderRadius: 6,
  cursor: 'pointer',
});

export const issues = style({
  marginTop: 16,
  fontSize: 12,
  color: cssVarV2('status/error'),
});
