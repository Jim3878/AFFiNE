import {
  DefaultTool,
  EdgelessCRUDIdentifier,
} from '@blocksuite/affine-block-surface';
import {
  EMBED_CARD_HEIGHT,
  EMBED_CARD_WIDTH,
} from '@blocksuite/affine-shared/consts';
import { createDefaultDoc } from '@blocksuite/affine-shared/utils';
import { Bound, type IVec } from '@blocksuite/global/gfx';
import type { BlockStdScope } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';

/**
 * NineDay: create an empty doc and place it on the canvas as an embedded doc
 * centered on `center` (model coordinates). The embed links the new doc from
 * this one, so it is listed under this doc in the sidebar.
 */
export function insertNewDocOnCanvas(std: BlockStdScope, center: IVec) {
  const gfx = std.get(GfxControllerIdentifier);
  const surface = gfx.surface;
  if (!surface) return;

  const newDoc = createDefaultDoc(std.store.workspace);

  const style = 'syncedDoc';
  const { addBlock } = std.get(EdgelessCRUDIdentifier);
  const id = addBlock(
    'affine:embed-synced-doc',
    {
      pageId: newDoc.id,
      xywh: Bound.fromCenter(
        center,
        EMBED_CARD_WIDTH[style],
        EMBED_CARD_HEIGHT[style]
      ).serialize(),
    },
    surface
  );

  gfx.tool.setTool(DefaultTool);
  gfx.selection.set({ elements: [id], editing: false });

  return id;
}
