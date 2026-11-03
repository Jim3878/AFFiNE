import { ConnectorElementModel, ConnectorMode } from '@blocksuite/affine-model';
import {
  Bound,
  type IVec,
  PointLocation,
  type SerializedXYWH,
} from '@blocksuite/global/gfx';
import { describe, expect, test } from 'vitest';

import { connectorIntersectsBox } from '../view/box-selection.js';

// Uses the real hit-testing methods of the model, with its stored props
// replaced by plain values.
const createConnector = (
  mode: ConnectorMode,
  path: IVec[],
  options: { strokeWidth?: number; label?: Bound } = {}
) => {
  const connector = Object.create(
    ConnectorElementModel.prototype
  ) as ConnectorElementModel;
  const props = {
    mode,
    absolutePath: path.map(p => new PointLocation(p)),
    strokeWidth: options.strokeWidth ?? 2,
    labelXYWH: options.label?.toXYWH(),
  };
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(connector, key, { value });
  }
  Object.defineProperty(connector, 'hasLabel', {
    value: () => Boolean(options.label),
  });
  return connector;
};

const box = (xywh: SerializedXYWH) => Bound.deserialize(xywh);

describe('connectorIntersectsBox', () => {
  test('a box inside the bounding box but away from a diagonal line misses', () => {
    const connector = createConnector(ConnectorMode.Straight, [
      [0, 0],
      [200, 200],
    ]);

    expect(connectorIntersectsBox(connector, box('[150,10,30,30]'))).toBe(
      false
    );
    expect(connectorIntersectsBox(connector, box('[90,80,30,30]'))).toBe(true);
  });

  test('an elbow connector is hit only along its segments', () => {
    const connector = createConnector(ConnectorMode.Orthogonal, [
      [0, 0],
      [200, 0],
      [200, 200],
    ]);

    expect(connectorIntersectsBox(connector, box('[20,150,30,30]'))).toBe(
      false
    );
    expect(connectorIntersectsBox(connector, box('[180,90,40,20]'))).toBe(true);
  });

  test('a thick line counts from its visible edge', () => {
    // Drawn from y=90 to y=110.
    const connector = createConnector(
      ConnectorMode.Straight,
      [
        [0, 100],
        [200, 100],
      ],
      { strokeWidth: 20 }
    );

    expect(connectorIntersectsBox(connector, box('[50,80,20,9]'))).toBe(false);
    expect(connectorIntersectsBox(connector, box('[50,80,20,12]'))).toBe(true);
  });

  test('a box enclosing the whole connector selects it', () => {
    const connector = createConnector(ConnectorMode.Straight, [
      [10, 10],
      [50, 60],
    ]);

    expect(connectorIntersectsBox(connector, box('[0,0,100,100]'))).toBe(true);
  });

  test('touching the label selects the connector', () => {
    const connector = createConnector(
      ConnectorMode.Straight,
      [
        [0, 0],
        [200, 200],
      ],
      { label: new Bound(120, 40, 60, 20) }
    );

    expect(connectorIntersectsBox(connector, box('[150,30,10,10]'))).toBe(true);
  });
});
