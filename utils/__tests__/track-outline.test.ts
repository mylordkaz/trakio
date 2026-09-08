import { buildOutlinePoints } from '@/utils/trackOutline';

const ORIGIN_LAT = 36.15;
const ORIGIN_LNG = 139.92;

function offsetMeters(east: number, north: number) {
  const scale = Math.cos((ORIGIN_LAT * Math.PI) / 180);

  return {
    latitude: ORIGIN_LAT + north / 111132,
    longitude: ORIGIN_LNG + east / (111320 * scale),
  };
}

function parse(points: string) {
  return points.split(' ').map((pair) => pair.split(',').map(Number) as [number, number]);
}

describe('buildOutlinePoints', () => {
  it('returns empty for degenerate paths', () => {
    expect(buildOutlinePoints([], 56, 4)).toBe('');
    expect(buildOutlinePoints([offsetMeters(0, 0)], 56, 4)).toBe('');
  });

  it('fits the outline inside the padded box', () => {
    const square = [
      offsetMeters(0, 0),
      offsetMeters(400, 0),
      offsetMeters(400, 400),
      offsetMeters(0, 400),
      offsetMeters(0, 0),
    ];

    for (const [x, y] of parse(buildOutlinePoints(square, 56, 4))) {
      expect(x).toBeGreaterThanOrEqual(4);
      expect(x).toBeLessThanOrEqual(52);
      expect(y).toBeGreaterThanOrEqual(4);
      expect(y).toBeLessThanOrEqual(52);
    }
  });

  it('preserves aspect ratio and centres the short axis', () => {
    // Twice as wide as tall: x spans the full box, y occupies the middle half.
    const wide = [
      offsetMeters(0, 0),
      offsetMeters(800, 0),
      offsetMeters(800, 400),
      offsetMeters(0, 400),
      offsetMeters(0, 0),
    ];
    const points = parse(buildOutlinePoints(wide, 56, 4));
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);

    expect(Math.min(...xs)).toBeCloseTo(4, 0);
    expect(Math.max(...xs)).toBeCloseTo(52, 0);
    const ySpan = Math.max(...ys) - Math.min(...ys);
    const xSpan = Math.max(...xs) - Math.min(...xs);

    expect(ySpan).toBeCloseTo(xSpan / 2, 0);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(28, 0);
  });
});
