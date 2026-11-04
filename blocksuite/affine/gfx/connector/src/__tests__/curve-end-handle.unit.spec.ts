import { type ShapeElementModel,shapeMethods } from '@blocksuite/affine-model';
import { type IVec, Vec } from '@blocksuite/global/gfx';
import { describe, expect, test } from 'vitest';

import { curveEndHandleLength } from '../connector-manager.js';

// The automatic handle of an attached curve end is the tangent turned -90°.
const outwardNormal = (
  xywh: [number, number, number, number],
  relative: IVec,
  rotate = 0
) => {
  const { tangent, ...point } = shapeMethods.ellipse.getRelativePointLocation(
    relative,
    { xywh: JSON.stringify(xywh), rotate } as unknown as ShapeElementModel
  );
  return {
    point: [point[0], point[1]] as IVec,
    normal: Vec.normalize(Vec.rot(tangent, -Math.PI / 2)),
  };
};

const expectVec = (actual: IVec, expected: IVec) => {
  expect(actual[0]).toBeCloseTo(expected[0], 6);
  expect(actual[1]).toBeCloseTo(expected[1], 6);
};

describe('ellipse attach point normals', () => {
  test('on a circle the normal points away from the center everywhere', () => {
    const xywh: [number, number, number, number] = [0, 0, 200, 200];
    for (const deg of [0, 30, 45, 90, 130, 200, 270, 315]) {
      const rad = (deg * Math.PI) / 180;
      const relative: IVec = [0.5 + Math.cos(rad) / 2, 0.5 + Math.sin(rad) / 2];
      const { point, normal } = outwardNormal(xywh, relative);
      expectVec(point, [100 + 100 * Math.cos(rad), 100 + 100 * Math.sin(rad)]);
      expectVec(normal, [Math.cos(rad), Math.sin(rad)]);
    }
  });

  test('matches the fixed tangents at the four edge midpoints', () => {
    const xywh: [number, number, number, number] = [10, 20, 300, 100];
    expectVec(outwardNormal(xywh, [0.5, 0]).normal, [0, -1]);
    expectVec(outwardNormal(xywh, [1, 0.5]).normal, [1, 0]);
    expectVec(outwardNormal(xywh, [0.5, 1]).normal, [0, 1]);
    expectVec(outwardNormal(xywh, [0, 0.5]).normal, [-1, 0]);
  });

  test('on a wide ellipse the normal is perpendicular to the outline', () => {
    // x = a cos t, y = b sin t; normal ∝ (b cos t, a sin t).
    const a = 150;
    const b = 50;
    const t = Math.PI / 4;
    const relative: IVec = [0.5 + Math.cos(t) / 2, 0.5 + Math.sin(t) / 2];
    const { normal } = outwardNormal([0, 0, 2 * a, 2 * b], relative);
    expectVec(normal, Vec.normalize([b * Math.cos(t), a * Math.sin(t)]));
  });

  test('turns with a rotated ellipse', () => {
    const { normal } = outwardNormal([0, 0, 300, 100], [1, 0.5], 30);
    const rad = Math.PI / 6;
    expectVec(normal, [Math.cos(rad), Math.sin(rad)]);
  });
});

describe('curveEndHandleLength', () => {
  test('is half the distance to the neighbouring point', () => {
    expect(curveEndHandleLength([0, 0], [600, 0])).toBe(300);
    expect(curveEndHandleLength([0, 0], [300, 400])).toBe(250);
  });

  test('is at least 100', () => {
    expect(curveEndHandleLength([0, 0], [50, 0])).toBe(100);
  });
});
