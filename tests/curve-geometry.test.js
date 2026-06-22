import { describe, expect, it } from 'vitest';
import { curvePath, getCurveGeometry } from '../js/utils.js';
import { bezierArcMidpoint } from '../js/connections.js';

function bezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y
  };
}

function highResolutionArcMidpoint({ p0, p1, p2, p3 }) {
  const points = [p0];
  const lengths = [];
  let total = 0;
  for (let index = 1; index <= 4096; index++) {
    const point = bezierPoint(p0, p1, p2, p3, index / 4096);
    const previous = points[index - 1];
    const length = Math.hypot(point.x - previous.x, point.y - previous.y);
    points.push(point);
    lengths.push(length);
    total += length;
  }
  let traversed = 0;
  for (let index = 0; index < lengths.length; index++) {
    if (traversed + lengths[index] >= total / 2) {
      const ratio = (total / 2 - traversed) / lengths[index];
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * ratio,
        y: points[index].y + (points[index + 1].y - points[index].y) * ratio
      };
    }
    traversed += lengths[index];
  }
  return p3;
}

describe('shared connection curve geometry', () => {
  it('produces the exact path control points used by labels and arrows', () => {
    const geometry = getCurveGeometry(10, 20, 400, 260, 'right', 'left');
    expect(geometry.isLine).toBe(false);
    expect(curvePath(10, 20, 400, 260, 'right', 'left')).toBe(
      `M${geometry.p0.x} ${geometry.p0.y} C${geometry.p1.x} ${geometry.p1.y}, ${geometry.p2.x} ${geometry.p2.y}, ${geometry.p3.x} ${geometry.p3.y}`
    );
  });

  it('preserves the overlapping-point line fast path', () => {
    const geometry = getCurveGeometry(5, 5, 5.5, 5.5, 'top', 'bottom');
    expect(geometry.isLine).toBe(true);
    expect(curvePath(5, 5, 5.5, 5.5, 'top', 'bottom')).toBe('M5 5 L5.5 5.5');
  });

  it('keeps the layout-free label midpoint within a sub-pixel of arc length', () => {
    const cases = [
      [0, 0, 800, 40, 'right', 'top'],
      [50, 700, 620, 20, 'bottom', 'left'],
      [400, 20, 10, 500, 'left', 'right'],
      [10, 10, 90, 85, 'top', 'bottom'],
      [900, 500, 20, 30, 'bottom', 'top']
    ];
    cases.forEach(args => {
      const geometry = getCurveGeometry(...args);
      const actual = bezierArcMidpoint(geometry.p0, geometry.p1, geometry.p2, geometry.p3);
      const expected = highResolutionArcMidpoint(geometry);
      expect(Math.hypot(actual.x - expected.x, actual.y - expected.y)).toBeLessThan(0.5);
    });
  });
});
