import {
  menu,
  type MenuConfig,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { RefNodeSlotsProvider } from '@blocksuite/affine-inline-reference';
import {
  BaseCellRenderer,
  createFromBaseCellRenderer,
  createIcon,
} from '@blocksuite/data-view';
import { signal } from '@preact/signals-core';
import { html, type PropertyValues } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

import { EditorHostKey } from '../../context/host-context.js';
import {
  relationCellStyle,
  relationChipStyle,
  relationListStyle,
  relationMissingStyle,
} from './cell-renderer-css.js';
import {
  type RelationPropertyData,
  relationPropertyModelConfig,
} from './define.js';
import {
  databaseTitle,
  listDatabases,
  listRows,
  relationStoreTick,
  type RelationTarget,
  resolveEntry,
} from './target.js';

type PickerMode =
  | { kind: 'rows' }
  | { kind: 'docs' }
  | { kind: 'databases'; docId: string };

type Chip = {
  key: string;
  title: string;
  openDocId?: string;
  missing?: boolean;
};

export class RelationCell extends BaseCellRenderer<
  string[],
  string[],
  RelationPropertyData
> {
  private closePicker?: () => void;

  private readonly mode$ = signal<PickerMode>({ kind: 'rows' });

  protected override firstUpdated(changedProperties: PropertyValues) {
    super.firstUpdated(changedProperties);
    this.classList.add(relationCellStyle);
  }

  get std() {
    return this.view.serviceGet(EditorHostKey)?.std;
  }

  private get target(): RelationTarget | undefined {
    return this.property.data$.value.target;
  }

  private chips(): Chip[] {
    const std = this.std;
    const entries = this.value ?? [];
    if (!std) return [];
    const target = this.target;
    if (!target) {
      // No related database yet: entries are docs (Text -> Relation, first version).
      return entries.map(id => {
        const meta = std.workspace.meta.getDocMeta(id);
        return meta && !meta.trash
          ? { key: id, title: meta.title || 'Untitled', openDocId: id }
          : { key: id, title: 'Deleted', missing: true };
      });
    }
    const rows = listRows(std, target);
    if (!rows) {
      return entries.map(id => ({ key: id, title: '…' }));
    }
    return entries.map(entry => {
      const row = resolveEntry(rows, entry);
      return row
        ? {
            key: entry,
            title: row.title,
            openDocId: row.docId ?? target.docId,
          }
        : { key: entry, title: 'Deleted', missing: true };
    });
  }

  private readonly openDoc = (e: MouseEvent, docId?: string) => {
    e.stopPropagation();
    const std = this.std;
    if (!std || !docId) return;
    std.getOptional(RefNodeSlotsProvider)?.docLinkClicked.next({
      pageId: docId,
      host: std.host,
    });
  };

  private setTarget(target: RelationTarget) {
    this.property.dataUpdate(data => ({ ...data, target }));
    this.mode$.value = { kind: 'rows' };
  }

  private chooseDoc(docId: string) {
    const std = this.std;
    if (!std) return;
    const databases = listDatabases(std, docId);
    const only = databases?.length === 1 ? databases[0] : undefined;
    if (only) {
      this.setTarget({ docId, blockId: only.blockId });
    } else {
      this.mode$.value = { kind: 'databases', docId };
    }
  }

  private toggleRow(rowId: string) {
    const std = this.std;
    const target = this.target;
    if (!std || !target) return;
    const rows = listRows(std, target) ?? [];
    // Normalize doc-id entries to row ids while we are rewriting the value.
    const current = (this.value ?? []).map(e => resolveEntry(rows, e)?.id ?? e);
    const next = current.includes(rowId)
      ? current.filter(v => v !== rowId)
      : [...current, rowId];
    this.valueSetImmediate([...new Set(next)]);
  }

  private pickerItems(): MenuConfig[] {
    const std = this.std;
    if (!std) return [];
    void relationStoreTick.value;
    const mode = this.mode$.value;
    const target = this.target;

    if (mode.kind === 'docs' || !target) {
      const docs = std.workspace.meta.docMetas
        .filter(d => !d.trash)
        .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      return [
        menu.group({
          name: 'Choose the doc that holds the database to relate to',
          items: docs.map(doc =>
            menu.action({
              name: doc.title || 'Untitled',
              closeOnSelect: false,
              select: () => {
                this.chooseDoc(doc.id);
              },
            })
          ),
        }),
      ];
    }

    if (mode.kind === 'databases') {
      const back = menu.action({
        name: 'Back',
        closeOnSelect: false,
        select: () => {
          this.mode$.value = { kind: 'docs' };
        },
      });
      const databases = listDatabases(std, mode.docId);
      if (!databases) {
        return [
          menu.action({
            name: 'Loading…',
            closeOnSelect: false,
            select: () => {},
          }),
          back,
        ];
      }
      if (databases.length === 0) {
        return [
          menu.action({
            name: 'This doc has no database',
            closeOnSelect: false,
            select: () => {},
          }),
          back,
        ];
      }
      return [
        menu.group({
          name: 'Choose a database',
          items: databases.map(db =>
            menu.action({
              name: db.title || 'Untitled database',
              closeOnSelect: false,
              select: () => {
                this.setTarget({ docId: mode.docId, blockId: db.blockId });
              },
            })
          ),
        }),
        back,
      ];
    }

    const header = menu.group({
      items: [
        menu.action({
          name: `Related: ${databaseTitle(std, target)}`,
          postfix: html`<span style="color: var(--affine-text-secondary-color)"
            >Change</span
          >`,
          closeOnSelect: false,
          select: () => {
            this.mode$.value = { kind: 'docs' };
          },
        }),
      ],
    });
    const rows = listRows(std, target);
    if (!rows) {
      return [
        header,
        menu.action({
          name: 'Loading…',
          closeOnSelect: false,
          select: () => {},
        }),
      ];
    }
    const selected = new Set(
      (this.value ?? []).map(e => resolveEntry(rows, e)?.id ?? e)
    );
    return [
      header,
      menu.group({
        items: rows.map(row =>
          menu.action({
            name: row.title,
            isSelected: selected.has(row.id),
            closeOnSelect: false,
            select: () => {
              this.toggleRow(row.id);
            },
          })
        ),
      }),
    ];
  }

  private popPicker() {
    if (!this.std) return;
    this.mode$.value = { kind: 'rows' };
    const handler = popMenu(popupTargetFromElement(this), {
      options: {
        search: { placeholder: 'Search' },
        onClose: () => {
          this.closePicker = undefined;
          this.selectCurrentCell(false);
        },
        items: [menu.dynamic(() => this.pickerItems())],
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
    void relationStoreTick.value;
    return html`<div class="${relationListStyle}">
      ${repeat(
        this.chips(),
        chip => chip.key,
        chip =>
          chip.missing
            ? html`<span class="${relationChipStyle} ${relationMissingStyle}"
                >${chip.title}</span
              >`
            : html`<span
                class="${relationChipStyle}"
                data-testid="relation-chip"
                @click="${(e: MouseEvent) => this.openDoc(e, chip.openDocId)}"
                >${chip.title}</span
              >`
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
