import {
  menu,
  type MenuConfig,
} from '@blocksuite/affine-components/context-menu';
import type { Signal } from '@preact/signals-core';
import { html } from 'lit';

import { relationPickerListStyle } from './cell-renderer-css.js';
import {
  listDatabases,
  relationStoreTick,
  type RelationTarget,
  type WorkspaceHolder,
} from './target.js';

/** Like menu.group, but the items scroll inside a capped-height list. */
export const scrollGroup =
  (items: MenuConfig[]): MenuConfig =>
  (menu, index) => {
    const rendered = menu.renderItems(items);
    if (!rendered.length) return;
    return html`${
        index === 0
          ? ''
          : html`<div
              style="height: 0.5px;background-color: var(--affine-divider-color);margin: 4px 0"
            ></div>`
      }
      <div class="${relationPickerListStyle}">${rendered}</div>`;
  };

export type ChooserMode =
  | { kind: 'docs' }
  | { kind: 'databases'; docId: string };

/**
 * Menu items to choose the database a relation points at: the workspace's docs
 * first, then the databases of the chosen doc (skipped when it has just one).
 * `keepOpen`: stay open after picking (the cell picker goes on to list rows).
 */
export function databaseChooserItems(
  std: WorkspaceHolder,
  mode$: Signal<ChooserMode>,
  pick: (target: RelationTarget) => void,
  keepOpen: boolean
): MenuConfig[] {
  void relationStoreTick.value;
  const mode = mode$.value;
  const choose = (target: RelationTarget) => {
    pick(target);
    return keepOpen ? false : undefined;
  };

  if (mode.kind === 'docs') {
    const docs = std.workspace.meta.docMetas
      .filter(d => !d.trash)
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    return [
      scrollGroup(
        docs.map(doc =>
          menu.action({
            name: doc.title || 'Untitled',
            select: () => {
              const databases = listDatabases(std, doc.id);
              const only = databases?.length === 1 ? databases[0] : undefined;
              if (only) {
                return choose({ docId: doc.id, blockId: only.blockId });
              }
              mode$.value = { kind: 'databases', docId: doc.id };
              return false;
            },
          })
        )
      ),
    ];
  }

  const back = menu.action({
    name: 'Back',
    select: () => {
      mode$.value = { kind: 'docs' };
      return false;
    },
  });
  const databases = listDatabases(std, mode.docId);
  const note = (name: string) => menu.action({ name, select: () => false });
  if (!databases) return [note('Loading…'), back];
  if (databases.length === 0) return [note('This doc has no database'), back];
  return [
    scrollGroup(
      databases.map(db =>
        menu.action({
          name: db.title || 'Untitled database',
          select: () => choose({ docId: mode.docId, blockId: db.blockId }),
        })
      )
    ),
    back,
  ];
}
