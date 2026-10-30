/**
 * NineDay: the title of a linked doc card on the edgeless canvas can be enlarged,
 * like the title of a synced doc (same sizes, see `../embed-synced-doc-block/title-size.ts`).
 * The size is stored on the block (`titleFontSize`). The title stays on one line:
 * picking a size widens the card to fit it, and the card can be narrowed again
 * from its side handles, down to the width of its style.
 */
import type { EmbedLinkedDocModel } from '@blocksuite/affine-model';
import {
  EMBED_CARD_HEIGHT,
  EMBED_CARD_WIDTH,
} from '@blocksuite/affine-shared/consts';
import { Bound } from '@blocksuite/global/gfx';

/** Line height of an enlarged card title, in px. */
export function linkedDocTitleLineHeight(titleFontSize: number) {
  return Math.ceil(titleFontSize * 1.3);
}

/** Width of the card's style at its current scale (the height follows the scale). */
export function linkedDocStyleWidth(
  model: EmbedLinkedDocModel,
  height: number
) {
  const { style } = model.props;
  return EMBED_CARD_WIDTH[style] * (height / EMBED_CARD_HEIGHT[style]);
}

/** Widens the card by `overflow` px (the part of the title that does not fit). */
export function widenLinkedDocCard(
  model: EmbedLinkedDocModel,
  overflow: number
) {
  if (overflow <= 0) return;
  const bound = Bound.deserialize(model.xywh);
  bound.w += Math.ceil(overflow);
  model.store.transact(() => {
    model.xywh = bound.serialize();
  });
}
