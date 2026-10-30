import { describe, expect, test } from 'vitest';

import {
  curveIntersects,
  getBezierParameters,
  getBezierPathBoundingBox,
  getBezierPathNearest,
  getBezierPathPoint,
  getBezierSegments,
  sampleBezierPath,
} from '../gfx/curve.js';
import { PointLocation } from '../gfx/model/index.js';

describe('getBezierParameters', () => {
  test('should handle empty path', () => {
    expect(() => getBezierParameters([])).not.toThrow();
    expect(getBezierParameters([])).toEqual([
      new PointLocation(),
      new PointLocation(),
      new PointLocation(),
      new PointLocation(),
    ]);
  });

  test('should handle single-point path', () => {
    const point = new PointLocation([10, 20]);

    expect(getBezierParameters([point])).toEqual([point, point, point, point]);
  });
});

// NineDay: curve paths through anchors.
describe('multi-segment bezier paths', () => {
  // Straight segments (no handles): (0,0) -> (100,0) -> (100,100).
  const corner = () => [
    new PointLocation([0, 0]),
    new PointLocation([100, 0]),
    new PointLocation([100, 100]),
  ];

  test('splits a path into one segment per pair of points', () => {
    expect(getBezierSegments(corner())).toHaveLength(2);
    expect(getBezierSegments([new PointLocation([1, 2])])).toHaveLength(1);
  });

  test('a two-point path matches the single-segment functions', () => {
    const path = [
      new PointLocation([0, 0], [0, 0], [0, 0], [50, 0]),
      new PointLocation([100, 100], [0, 0], [0, -50], [0, 0]),
    ];
    expect(getBezierSegments(path)).toEqual([getBezierParameters(path)]);
  });

  test('time spreads evenly over the segments', () => {
    const path = corner();
    expect(getBezierPathPoint(path, 0)).toEqual([0, 0]);
    expect(getBezierPathPoint(path, 0.25)).toEqual([50, 0]);
    expect(getBezierPathPoint(path, 0.5)).toEqual([100, 0]);
    expect(getBezierPathPoint(path, 0.75)).toEqual([100, 50]);
    expect(getBezierPathPoint(path, 1)).toEqual([100, 100]);
  });

  test('finds the nearest point on any segment', () => {
    const { t, point } = getBezierPathNearest(corner(), [120, 50]);
    expect(point[0]).toBeCloseTo(100);
    expect(point[1]).toBeCloseTo(50);
    expect(t).toBeCloseTo(0.75);
  });

  test('bounds cover every segment', () => {
    const bound = getBezierPathBoundingBox(corner());
    expect([bound.x, bound.y, bound.w, bound.h]).toEqual([0, 0, 100, 100]);
  });

  test('intersects a line crossing the second segment', () => {
    const hits = curveIntersects(corner(), [
      [50, 50],
      [150, 50],
    ]);
    expect(hits).toHaveLength(1);
    expect(hits![0][0]).toBeCloseTo(100);
    expect(hits![0][1]).toBeCloseTo(50);
  });

  test('samples include both ends and every anchor', () => {
    const samples = sampleBezierPath(corner(), 4);
    expect(samples).toHaveLength(9);
    expect(samples[0]).toEqual([0, 0]);
    expect(samples[4]).toEqual([100, 0]);
    expect(samples[8]).toEqual([100, 100]);
  });
});
