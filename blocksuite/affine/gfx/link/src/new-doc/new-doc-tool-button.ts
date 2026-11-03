import { DefaultTool } from '@blocksuite/affine-block-surface';
import { QuickToolMixin } from '@blocksuite/affine-widget-edgeless-toolbar';
import { NewPageIcon } from '@blocksuite/icons/lit';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { css, html, LitElement } from 'lit';

import { newDocLabel } from './consts';
import { insertNewDocOnCanvas } from './insert-new-doc';

/** NineDay: a quick tool that adds an empty doc in the middle of the screen. */
export class EdgelessNewDocToolButton extends QuickToolMixin(LitElement) {
  static override styles = css`
    .new-doc-icon {
      display: flex;
      font-size: 24px;
    }
  `;

  override type = DefaultTool;

  private _onClick() {
    const { std } = this.edgeless;
    const gfx = std.get(GfxControllerIdentifier);
    const { centerX, centerY } = gfx.viewport;
    insertNewDocOnCanvas(std, [centerX, centerY]);
  }

  override render() {
    return html`<edgeless-tool-icon-button
      .iconContainerPadding="${6}"
      .tooltip="${newDocLabel()}"
      .tooltipOffset=${17}
      class="edgeless-new-doc-tool-button"
      @click=${this._onClick}
    >
      <span class="new-doc-icon">${NewPageIcon()}</span>
    </edgeless-tool-icon-button>`;
  }
}
