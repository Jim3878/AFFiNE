import { toEdgelessEmbedBlock } from '@blocksuite/affine-block-embed';
import {
  EdgelessCRUDIdentifier,
  reassociateConnectorsCommand,
} from '@blocksuite/affine-block-surface';
import { EmbedLinkedDocBlockSchema } from '@blocksuite/affine-model';
import {
  EMBED_CARD_HEIGHT,
  EMBED_CARD_WIDTH,
} from '@blocksuite/affine-shared/consts';
import {
  cloneReferenceInfoWithoutAliases,
  isNewTabTrigger,
  isNewViewTrigger,
} from '@blocksuite/affine-shared/utils';
import { Bound } from '@blocksuite/global/gfx';
import { GfxViewInteractionExtension } from '@blocksuite/std/gfx';
import { query } from 'lit/decorators.js';

import { EmbedLinkedDocBlockComponent } from './embed-linked-doc-block.js';
import { linkedDocStyleWidth } from './title-size.js';

export class EmbedEdgelessLinkedDocBlockComponent extends toEdgelessEmbedBlock(
  EmbedLinkedDocBlockComponent
) {
  override convertToEmbed = () => {
    const { caption, xywh, titleFontSize } = this.model.props;
    const { store, id } = this.model;

    const style = 'syncedDoc';
    const bound = Bound.deserialize(xywh);
    bound.w = EMBED_CARD_WIDTH[style];
    bound.h = EMBED_CARD_HEIGHT[style];

    const { addBlock } = this.std.get(EdgelessCRUDIdentifier);
    const surface = this.gfx.surface ?? undefined;
    const newId = addBlock(
      'affine:embed-synced-doc',
      {
        xywh: bound.serialize(),
        caption,
        // NineDay: keep the title size when switching to the embed view.
        titleFontSize,
        ...cloneReferenceInfoWithoutAliases(this.referenceInfo$.peek()),
      },
      surface
    );

    this.std.command.exec(reassociateConnectorsCommand, {
      oldId: id,
      newId,
    });

    this.gfx.selection.set({
      editing: false,
      elements: [newId],
    });

    store.deleteBlock(this.model);
  };

  protected override _handleClick = (evt: MouseEvent): void => {
    if (isNewTabTrigger(evt)) {
      this.open({ openMode: 'open-in-new-tab', event: evt });
    } else if (isNewViewTrigger(evt)) {
      this.open({ openMode: 'open-in-new-view', event: evt });
    }
  };

  /** NineDay: how many px of the enlarged title do not fit in the card. */
  get titleOverflow() {
    const title = this.titleElement;
    if (!title?.classList.contains('sized')) return 0;
    return title.scrollWidth - title.clientWidth;
  }

  @query('.affine-embed-linked-doc-content-title-text')
  accessor titleElement!: HTMLDivElement | null;
}

export const EmbedLinkedDocInteraction =
  GfxViewInteractionExtension<EmbedEdgelessLinkedDocBlockComponent>(
    EmbedLinkedDocBlockSchema.model.flavour,
    {
      // NineDay: the side handles change only the width (corners keep the ratio),
      // to narrow a card widened for its title.
      resizeConstraint: {
        lockRatio: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
        allowedHandlers: [
          'top-left',
          'top-right',
          'left',
          'right',
          'bottom-left',
          'bottom-right',
        ],
      },
      handleRotate() {
        return {
          beforeRotate(context) {
            context.set({ rotatable: false });
          },
        };
      },
      handleResize: ({ model }) => ({
        onResizeMove: context => {
          const { handle, newBound, originalBound } = context;
          if (handle === 'left' || handle === 'right') {
            // Not narrower than the width of the card's style.
            const minWidth = linkedDocStyleWidth(model, newBound.h);
            if (newBound.w < minWidth) {
              // Resizing around the center (Alt) keeps the center.
              const centered =
                Math.abs(
                  newBound.x +
                    newBound.w / 2 -
                    (originalBound.x + originalBound.w / 2)
                ) < 0.5;
              if (centered) newBound.x -= (minWidth - newBound.w) / 2;
              else if (handle === 'left') newBound.x -= minWidth - newBound.w;
              newBound.w = minWidth;
            }
          }
          context.default(context);
        },
      }),
    }
  );
