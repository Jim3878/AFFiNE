import { EdgelessNewDocToolButton } from './new-doc';
import { EdgelessLinkToolButton } from './toolbar/link-tool-button';

export function effects() {
  customElements.define('edgeless-link-tool-button', EdgelessLinkToolButton);
  customElements.define(
    'edgeless-new-doc-tool-button',
    EdgelessNewDocToolButton
  );
}
