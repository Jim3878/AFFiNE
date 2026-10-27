import {
  createPopup,
  menu,
  type PopupTarget,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import {
  BaseCellRenderer,
  createFromBaseCellRenderer,
  createIcon,
  type Property,
} from '@blocksuite/data-view';
import { CheckBoxCheckSolidIcon, CheckBoxUnIcon } from '@blocksuite/icons/lit';
import { css } from '@emotion/css';
import { autoPlacement, offset, shift } from '@floating-ui/dom';
import { html, type PropertyValues } from 'lit';

import {
  type FormulaPropertyData,
  type FormulaResult,
  formulaResultText,
  inferResultType,
} from './compute.js';
import { formulaPropertyModelConfig } from './define.js';
import { FormulaEditor } from './editor.js';

/** What the database data source offers formula cells (see data-source.ts). */
export type FormulaHost = {
  formulaPreview(
    rowId: string,
    columnId: string,
    expression: string
  ): FormulaResult;
  rows$: { value: string[] };
};

const formulaCellStyle = css({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  overflow: 'hidden',
  fontSize: 'var(--data-view-cell-text-size)',
  lineHeight: 'var(--data-view-cell-text-line-height)',
});

const numberStyle = css({
  width: '100%',
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
});

const errorStyle = css({
  color: 'var(--affine-error-color)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

const textStyle = css({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  wordBreak: 'break-word',
});

export class FormulaCell extends BaseCellRenderer<
  FormulaResult,
  unknown,
  FormulaPropertyData
> {
  private closeEditor?: () => void;

  protected override firstUpdated(changedProperties: PropertyValues) {
    super.firstUpdated(changedProperties);
    this.classList.add(formulaCellStyle);
  }

  private openEditor() {
    this.closeEditor = openFormulaEditor(
      popupTargetFromElement(this),
      this.property,
      this.cell.rowId,
      () => {
        this.closeEditor = undefined;
        this.selectCurrentCell(false);
      }
    );
  }

  override afterEnterEditingMode() {
    if (!this.closeEditor && !this.view.manager.dataSource.readonly$.value) {
      this.openEditor();
    }
  }

  override beforeExitEditingMode() {
    requestAnimationFrame(() => {
      this.closeEditor?.();
    });
  }

  override render() {
    const result = this.value;
    if (!result || result.type === 'empty') return html``;
    switch (result.type) {
      case 'error':
        return html`<span class="${errorStyle}" title="${result.message}"
          >⚠ ${result.message}</span
        >`;
      case 'boolean':
        return result.value
          ? CheckBoxCheckSolidIcon({ style: 'color:#1E96EB' })
          : CheckBoxUnIcon();
      case 'number':
        return html`<span class="${numberStyle}"
          >${formulaResultText(result)}</span
        >`;
      default:
        return html`<span class="${textStyle}"
          >${formulaResultText(result)}</span
        >`;
    }
  }
}

type FormulaProperty = Property<FormulaResult, unknown, FormulaPropertyData>;

/**
 * Opens the formula editor for a column, previewing row `rowId` (the first row
 * when opened from the column header). Returns a function that closes it.
 */
function openFormulaEditor(
  target: PopupTarget,
  property: FormulaProperty,
  rowId: string | undefined,
  onClose?: () => void
): () => void {
  const host = property.view.manager.dataSource as unknown as FormulaHost;
  const own = property.id;
  const editor = new FormulaEditor();
  editor.expression = property.data$.value.expression ?? '';
  editor.properties = property.view.propertiesRaw$.value
    .filter(p => p.id !== own)
    .map(p => p.name$.value)
    .filter(Boolean);
  editor.preview = expression =>
    rowId
      ? host.formulaPreview(rowId, own, expression)
      : { type: 'empty' as const };
  const close = createPopup(target, editor, {
    onClose,
    middleware: [
      autoPlacement({
        allowedPlacements: [
          'bottom-start',
          'bottom-end',
          'top-start',
          'top-end',
        ],
      }),
      offset(4),
      shift({ padding: 8 }),
    ],
  });
  editor.onSave = expression => {
    const results = host.rows$.value.map(id =>
      host.formulaPreview(id, own, expression)
    );
    property.dataUpdate(() => ({
      expression,
      resultType: inferResultType(results),
    }));
    close();
  };
  editor.onCancel = close;
  return close;
}

export const formulaColumnConfig =
  formulaPropertyModelConfig.createPropertyMeta({
    icon: createIcon('MathPanelIcon'),
    cellRenderer: {
      view: createFromBaseCellRenderer(FormulaCell),
    },
    headerMenu: (property, target) =>
      property.readonly$.value
        ? []
        : [
            menu.action({
              name: 'Edit formula',
              select: () => {
                // Open after the header menu has closed.
                requestAnimationFrame(() => {
                  openFormulaEditor(
                    target,
                    property,
                    property.view.manager.dataSource.rows$.value[0]
                  );
                });
              },
            }),
          ],
  });
