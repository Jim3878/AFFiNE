import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { RefNodeSlotsProvider } from '@blocksuite/affine-inline-reference';
import {
  BaseCellRenderer,
  createFromBaseCellRenderer,
  createIcon,
} from '@blocksuite/data-view';
import { html, type PropertyValues } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

import { EditorHostKey } from '../../context/host-context.js';
import {
  relationCellStyle,
  relationChipStyle,
  relationListStyle,
  relationMissingStyle,
} from './cell-renderer-css.js';
import { relationPropertyModelConfig } from './define.js';

export class RelationCell extends BaseCellRenderer<string[], string[]> {
  private closePicker?: () => void;

  protected override firstUpdated(changedProperties: PropertyValues) {
    super.firstUpdated(changedProperties);
    this.classList.add(relationCellStyle);
  }

  get std() {
    return this.view.serviceGet(EditorHostKey)?.std;
  }

  private titleOf(id: string): string | undefined {
    const meta = this.std?.workspace.meta.getDocMeta(id);
    if (!meta || meta.trash) return undefined;
    return meta.title || 'Untitled';
  }

  private readonly openDoc = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    const std = this.std;
    if (!std || !this.titleOf(id)) return;
    std.getOptional(RefNodeSlotsProvider)?.docLinkClicked.next({
      pageId: id,
      host: std.host,
    });
  };

  private toggle(id: string) {
    const current = this.value ?? [];
    this.valueSetImmediate(
      current.includes(id) ? current.filter(v => v !== id) : [...current, id]
    );
  }

  private popPicker() {
    const std = this.std;
    if (!std) return;
    const handler = popMenu(popupTargetFromElement(this), {
      options: {
        search: { placeholder: 'Search docs' },
        onClose: () => {
          this.closePicker = undefined;
          this.selectCurrentCell(false);
        },
        items: [
          menu.dynamic(() => {
            // Reads this.value (a signal), so the list re-renders on every toggle.
            const selected = new Set(this.value ?? []);
            const docs = std.workspace.meta.docMetas
              .filter(d => !d.trash)
              .sort(
                (a, b) =>
                  Number(selected.has(b.id)) - Number(selected.has(a.id)) ||
                  (a.title || '').localeCompare(b.title || '')
              );
            return docs.map(doc =>
              menu.action({
                name: doc.title || 'Untitled',
                isSelected: selected.has(doc.id),
                closeOnSelect: false,
                select: () => {
                  this.toggle(doc.id);
                },
              })
            );
          }),
        ],
      },
    });
    this.closePicker = handler.close;
  }

  override afterEnterEditingMode() {
    if (!this.closePicker) {
      this.popPicker();
    }
  }

  override beforeExitEditingMode() {
    requestAnimationFrame(() => {
      this.closePicker?.();
      this.closePicker = undefined;
    });
  }

  override render() {
    const ids = this.value ?? [];
    return html`<div class="${relationListStyle}">
      ${repeat(
        ids,
        id => id,
        id => {
          const title = this.titleOf(id);
          return title
            ? html`<span
                class="${relationChipStyle}"
                data-testid="relation-chip"
                @click="${(e: MouseEvent) => this.openDoc(e, id)}"
                >${title}</span
              >`
            : html`<span class="${relationChipStyle} ${relationMissingStyle}"
                >Deleted doc</span
              >`;
        }
      )}
    </div>`;
  }
}

export const relationColumnConfig =
  relationPropertyModelConfig.createPropertyMeta({
    icon: createIcon('LinkedPageIcon'),
    cellRenderer: {
      view: createFromBaseCellRenderer(RelationCell),
    },
  });
