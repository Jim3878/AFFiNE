import type { ConnectorElementModel } from '@blocksuite/affine-model';
import { Bound, type IBound } from '@blocksuite/global/gfx';

/**
 * Whether a selection box touches the connector as it is drawn: its path,
 * widened by half the stroke so a thick line counts from its visible edge,
 * or its label.
 */
export function connectorIntersectsBox(
  connector: Pick<ConnectorElementModel, 'strokeWidth' | 'intersectsBound'>,
  box: IBound
) {
  const bound = Bound.from(box).expand(connector.strokeWidth / 2);
  return connector.intersectsBound(bound);
}
