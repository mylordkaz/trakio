import type { Coordinate } from '@/db/types';
import { buildTrackRibbon, DEFAULT_TRACK_WIDTH_METERS } from '@/utils/trackRibbon';

const METERS_PER_DEGREE_LATITUDE = 111132;
const METERS_PER_DEGREE_LONGITUDE = 111320;

const ORIGIN_LAT = 36.15;
const ORIGIN_LNG = 139.92;

function metersBetween(a: Coordinate, b: Coordinate) {
  const scale = Math.cos((ORIGIN_LAT * Math.PI) / 180);
  const dy = (b.latitude - a.latitude) * METERS_PER_DEGREE_LATITUDE;
  const dx = (b.longitude - a.longitude) * METERS_PER_DEGREE_LONGITUDE * scale;

  return Math.hypot(dx, dy);
}

function distanceToPath(point: Coordinate, path: Coordinate[]) {
  let best = Infinity;

  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const scale = Math.cos((ORIGIN_LAT * Math.PI) / 180);
    const px = (point.longitude - a.longitude) * METERS_PER_DEGREE_LONGITUDE * scale;
    const py = (point.latitude - a.latitude) * METERS_PER_DEGREE_LATITUDE;
    const bx = (b.longitude - a.longitude) * METERS_PER_DEGREE_LONGITUDE * scale;
    const by = (b.latitude - a.latitude) * METERS_PER_DEGREE_LATITUDE;
    const lengthSquared = bx * bx + by * by;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / lengthSquared));

    best = Math.min(best, Math.hypot(px - t * bx, py - t * by));
  }

  return best;
}

function offsetMeters(east: number, north: number): Coordinate {
  const scale = Math.cos((ORIGIN_LAT * Math.PI) / 180);

  return {
    latitude: ORIGIN_LAT + north / METERS_PER_DEGREE_LATITUDE,
    longitude: ORIGIN_LNG + east / (METERS_PER_DEGREE_LONGITUDE * scale),
  };
}

// Closed square loop, 200 m a side, sampled every 20 m.
function squareLoop(): Coordinate[] {
  const points: Coordinate[] = [];
  const side = 200;
  const step = 20;

  for (let d = 0; d < side; d += step) points.push(offsetMeters(d, 0));
  for (let d = 0; d < side; d += step) points.push(offsetMeters(side, d));
  for (let d = 0; d < side; d += step) points.push(offsetMeters(side - d, side));
  for (let d = 0; d < side; d += step) points.push(offsetMeters(0, side - d));
  points.push(points[0]);

  return points;
}

describe('buildTrackRibbon', () => {
  it('returns null for paths too short to widen', () => {
    expect(buildTrackRibbon(null)).toBeNull();
    expect(buildTrackRibbon([])).toBeNull();
    expect(buildTrackRibbon([offsetMeters(0, 0), offsetMeters(10, 0)])).toBeNull();
  });

  it('fills a closed loop as seamless bands with matching edges', () => {
    const path = squareLoop();
    const ribbon = buildTrackRibbon(path, 12)!;

    expect(ribbon.fill.length).toBeGreaterThan(0);
    expect(ribbon.edges).toHaveLength(2);
    // Both kerb lines close back on themselves and stay in step with each other.
    expect(ribbon.edges[0]).toHaveLength(ribbon.edges[1].length);
    for (const edge of ribbon.edges) {
      expect(edge).toHaveLength(path.length);
      expect(edge[0]).toEqual(edge[edge.length - 1]);
    }
    // Consecutive bands overlap rather than merely touch, so no antialiased
    // hairline can show through between them.
    for (let i = 1; i < ribbon.fill.length; i += 1) {
      const previous = ribbon.fill[i - 1];
      const current = ribbon.fill[i];
      const previousLeft = previous.slice(0, previous.length / 2);
      const start = previousLeft.findIndex((point) => point === current[0]);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(start).toBeLessThan(previousLeft.length - 1);
    }
  });

  it('separates the two edges by the requested ground width', () => {
    const width = 12;
    const ribbon = buildTrackRibbon(squareLoop(), width)!;

    // Midpoint of the loop's first (southern) edge, away from any corner.
    expect(metersBetween(ribbon.edges[0][3], ribbon.edges[1][3])).toBeCloseTo(width, 1);
  });

  it('keeps the band centred on the original path', () => {
    const path = squareLoop();
    const ribbon = buildTrackRibbon(path, 12)!;

    // Every midpoint between the two kerbs sits on the centreline, so the band
    // is never lopsided.
    const widths: number[] = [];

    for (let i = 0; i < ribbon.edges[0].length; i += 1) {
      const left = ribbon.edges[0][i];
      const right = ribbon.edges[1][i];
      const midpoint = {
        latitude: (left.latitude + right.latitude) / 2,
        longitude: (left.longitude + right.longitude) / 2,
      };

      expect(distanceToPath(midpoint, path)).toBeLessThan(0.5);
      widths.push(metersBetween(left, right));
    }

    // Kerb-to-kerb is measured along the bisector, so it exceeds the width at a
    // corner even though the perpendicular width is unchanged. Along this loop's
    // straights, which are most of it, it is exactly the width.
    expect(widths.sort((a, b) => a - b)[Math.floor(widths.length / 2)]).toBeCloseTo(12, 1);
  });

  it('leaves an open path unclosed', () => {
    const straight = [offsetMeters(0, 0), offsetMeters(50, 0), offsetMeters(100, 0)];
    const ribbon = buildTrackRibbon(straight, 10)!;

    expect(ribbon.fill).toHaveLength(1);
    expect(ribbon.fill[0]).toHaveLength(straight.length * 2);
    for (const edge of ribbon.edges) {
      expect(edge).toHaveLength(straight.length);
      expect(edge[0]).not.toEqual(edge[edge.length - 1]);
    }
  });

  it('scales the band with the requested width', () => {
    const path = squareLoop();
    const narrow = buildTrackRibbon(path, 8)!;
    const wide = buildTrackRibbon(path, 20)!;

    expect(metersBetween(narrow.edges[0][3], narrow.edges[1][3])).toBeCloseTo(8, 1);
    expect(metersBetween(wide.edges[0][3], wide.edges[1][3])).toBeCloseTo(20, 1);
  });

  it('defaults to a typical circuit width', () => {
    const ribbon = buildTrackRibbon(squareLoop())!;

    expect(metersBetween(ribbon.edges[0][3], ribbon.edges[1][3])).toBeCloseTo(
      DEFAULT_TRACK_WIDTH_METERS,
      1,
    );
  });
});
