import {
  getDefaultModalRoot,
  menu,
  type MenuHandler,
  popMenu,
} from '@blocksuite/affine-components/context-menu';
import type { IVec } from '@blocksuite/global/gfx';
import { NewPageIcon } from '@blocksuite/icons/lit';
import { GfxExtension } from '@blocksuite/std/gfx';

import { newDocLabel } from './consts';
import { insertNewDocOnCanvas } from './insert-new-doc';

/**
 * NineDay: right-clicking an empty spot of the canvas opens a menu that adds
 * an empty doc there. Right-clicking an element, or anything while editing,
 * keeps its usual behavior.
 */
export class NewDocContextMenu extends GfxExtension {
  static override key = 'nineday-new-doc-context-menu';

  private _dispose: (() => void) | null = null;

  private _menu: MenuHandler | null = null;

  override mounted() {
    this._dispose = this.std.event.add('contextMenu', ctx => {
      const event = ctx.get('defaultState').event;
      if (!(event instanceof MouseEvent)) return;
      if (this.gfx.selection.editing) return;
      if (!this._isCanvasTarget(event.target)) return;

      const point = this.gfx.viewport.toModelCoordFromClientCoord([
        event.clientX,
        event.clientY,
      ]);
      if (this.gfx.getElementByPoint(point[0], point[1])) return;

      event.preventDefault();
      this._open(event.clientX, event.clientY, point);
      return true;
    });
  }

  override unmounted() {
    this._dispose?.();
    this._dispose = null;
    this._menu?.close();
    this._menu = null;
  }

  /** The event hit the canvas itself, not a widget such as a toolbar. */
  private _isCanvasTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) return false;
    const root = this.std.view.getBlock(this.std.store.root?.id ?? '');
    if (!root?.contains(target)) return false;
    return !target.closest('[data-widget-id]');
  }

  private _open(clientX: number, clientY: number, point: IVec) {
    this._menu?.close();
    const rect = new DOMRect(clientX, clientY, 0, 0);
    this._menu = popMenu(
      {
        targetRect: { getBoundingClientRect: () => rect },
        root: getDefaultModalRoot(this.std.host),
        popupStart: () => () => {},
      },
      {
        options: {
          items: [
            menu.action({
              name: newDocLabel(),
              prefix: NewPageIcon(),
              select: () => {
                insertNewDocOnCanvas(this.std, point);
              },
            }),
          ],
          onClose: () => {
            this._menu = null;
          },
        },
      }
    );
  }
}
