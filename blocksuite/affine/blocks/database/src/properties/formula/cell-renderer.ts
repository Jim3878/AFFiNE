import {
  createPopup,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import {
  BaseCellRenderer,
  createFromBaseCellRenderer,
  createIcon,
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

  private get host(): FormulaHost {
    return this.view.manager.dataSource as unknown as FormulaHost;
  }

  private propertyNames(): string[] {
    const own = this.property.id;
    return this.view.propertiesRaw$.value
      .filter(p => p.id !== own)
      .map(p => p.name$.value)
      .filter(Boolean);
  }

  private save(expression: string) {
    const host = this.host;
    const columnId = this.property.id;
    const results = host.rows$.value.map(rowId =>
      host.formulaPreview(rowId, columnId, expression)
    );
    this.property.dataUpdate(() => ({
      expression,
      resultType: inferResultType(results),
    }));
    this.closeEditor?.();
  }

  private openEditor() {
    const editor = new FormulaEditor();
    editor.expression = this.property.data$.value.expression ?? '';
    editor.properties = this.propertyNames();
    editor.preview = expression =>
      this.host.formulaPreview(this.cell.rowId, this.property.id, expression);
    editor.onSave = expression => this.save(expression);
    editor.onCancel = () => this.closeEditor?.();
    const close = createPopup(popupTargetFromElement(this), editor, {
      onClose: () => {
        this.closeEditor = undefined;
        this.selectCurrentCell(false);
      },
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
    this.closeEditor = close;
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

export const formulaColumnConfig =
  formulaPropertyModelConfig.createPropertyMeta({
    icon: createIcon('MathPanelIcon'),
    cellRenderer: {
      view: createFromBaseCellRenderer(FormulaCell),
    },
  });
