import { QuickToolExtension } from '@blocksuite/affine-widget-edgeless-toolbar';
import { html } from 'lit';

export { NewDocContextMenu } from './new-doc-context-menu';
export { EdgelessNewDocToolButton } from './new-doc-tool-button';

/** NineDay: listed right after the link tool. */
export const newDocQuickTool = QuickToolExtension('new-doc', ({ block }) => {
  return {
    content: html`<edgeless-new-doc-tool-button
      .edgeless=${block}
    ></edgeless-new-doc-tool-button>`,
    // The link tool has the default priority 0.
    priority: -1,
  };
});
