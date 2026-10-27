import {
  menu,
  type MenuConfig,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { RefNodeSlotsProvider } from '@blocksuite/affine-inline-reference';
import type { ColumnDataType } from '@blocksuite/affine-model';
import {
  BaseCellRenderer,
  createFromBaseCellRenderer,
  createIcon,
  type Property,
} from '@blocksuite/data-view';
import { autoPlacement, offset, shift, size } from '@floating-ui/dom';
import { signal } from '@preact/signals-core';
import { html, type PropertyValues } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

import { EditorHostKey } from '../../context/host-context.js';
import {
  relationCellStyle,
  relationChipStyle,
  relationListStyle,
  relationMissingStyle,
  relationPickerListStyle,
} from './cell-renderer-css.js';
import {
  type RelationPropertyData,
  relationPropertyModelConfig,
} from './define.js';
import {
  type ChooserMode,
  databaseChooserItems,
  scrollGroup,
} from './picker.js';
import {
  databaseTitle,
  listRows,
  relationStoreTick,
  type RelationTarget,
  resolveEntry,
} from './target.js';

/** What the database data source offers relation columns (see data-source.ts). */
export type RelationHost = {
  relationSetEntries(
    rowId: string,
    propertyId: string,
    entries: string[]
  ): void;
  relationSetTarget(propertyId: string, target: RelationTarget): void;
  relationTwoWaySet(propertyId: string, on: boolean): void;
  relationPair(propertyId: string): ColumnDataType | undefined;
};

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

  /** Used only while the column has no related database yet. */
  private readonly chooser$ = signal<ChooserMode>({ kind: 'docs' });

  protected override firstUpdated(changedProperties: PropertyValues) {
    super.firstUpdated(changedProperties);
    this.classList.add(relationCellStyle);
  }

  get std() {
    return this.view.serviceGet(EditorHostKey)?.std;
  }

  private get host(): RelationHost {
    return this.view.manager.dataSource as unknown as RelationHost;
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
    this.host.relationSetEntries(this.cell.rowId, this.property.id, [
      ...new Set(next),
    ]);
  }

  private pickerItems(): MenuConfig[] {
    const std = this.std;
    if (!std) return [];
    void relationStoreTick.value;
    const target = this.target;

    if (!target) {
      return [
        menu.action({
          name: 'Choose the related database',
          select: () => false,
        }),
        ...databaseChooserItems(
          std,
          this.chooser$,
          picked => this.host.relationSetTarget(this.property.id, picked),
          true
        ),
      ];
    }

    const rows = listRows(std, target);
    if (!rows) {
      return [
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
      scrollGroup(
        rows.map(row =>
          menu.action({
            name: row.title,
            isSelected: selected.has(row.id),
            closeOnSelect: false,
            select: () => {
              this.toggleRow(row.id);
            },
          })
        )
      ),
    ];
  }

  private popPicker() {
    if (!this.std) return;
    this.chooser$.value = { kind: 'docs' };
    const handler = popMenu(popupTargetFromElement(this), {
      // popMenu's default placement, plus size(): keep the whole menu inside
      // the viewport by shrinking the scrollable list to the space left.
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
        size({
          padding: 8,
          apply({ availableHeight, elements }) {
            const menu = elements.floating;
            const list = menu.querySelector(`.${relationPickerListStyle}`);
            const rest =
              list instanceof HTMLElement
                ? menu.offsetHeight - list.offsetHeight
                : 0;
            menu.style.setProperty(
              '--relation-picker-max-height',
              `${Math.max(120, availableHeight - rest)}px`
            );
          },
        }),
      ],
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

const secondary = (text: string) =>
  html`<span
    style="color: var(--affine-text-secondary-color);font-size: 14px;max-width: 140px;overflow: hidden;text-overflow: ellipsis;white-space: nowrap"
    >${text}</span
  >`;

/** Column header menu: the related database and two-way setting. */
function relationHeaderMenu(
  property: Property<string[], string[], RelationPropertyData>
): MenuConfig[] {
  const std = property.view.serviceGet(EditorHostKey)?.std;
  if (!std || property.readonly$.value) return [];
  const host = property.view.manager.dataSource as unknown as RelationHost;
  const chooser$ = signal<ChooserMode>({ kind: 'docs' });

  const items = (): MenuConfig[] => {
    void relationStoreTick.value;
    const data = property.data$.value;
    const pair = host.relationPair(property.id);

    if (data.mirrorOf && data.target) {
      const source = databaseTitle(std, data.target);
      return [
        menu.action({
          name: pair
            ? `Two-way with ${source} · ${pair.name}`
            : `Two-way source in ${source} was deleted`,
          select: () => false,
        }),
        menu.action({
          name: 'Remove two-way relation',
          postfix: secondary('deletes this column'),
          class: { 'delete-item': true },
          select: () => {
            host.relationTwoWaySet(property.id, false);
          },
        }),
      ];
    }

    return [
      menu.subMenu({
        name: 'Related database',
        postfix: secondary(
          data.target ? databaseTitle(std, data.target) : 'Not set'
        ),
        options: {
          search: { placeholder: 'Search' },
          items: [
            menu.dynamic(() =>
              databaseChooserItems(
                std,
                chooser$,
                picked => host.relationSetTarget(property.id, picked),
                false
              )
            ),
          ],
        },
      }),
      ...(data.target
        ? [
            menu.toggleSwitch({
              name: 'Two-way relation',
              on: !!pair,
              onChange: on => host.relationTwoWaySet(property.id, on),
            }),
          ]
        : []),
    ];
  };

  return [menu.group({ items: [menu.dynamic(items)] })];
}

export const relationColumnConfig =
  relationPropertyModelConfig.createPropertyMeta({
    icon: createIcon('LinkedPageIcon'),
    cellRenderer: {
      view: createFromBaseCellRenderer(RelationCell),
    },
    headerMenu: relationHeaderMenu,
  });
