import { TRACK_SEED_DRAFTS } from '@/db/seeds';
import { getSectorCount, getTimingTopology, isTimingConfigured } from '@/utils/timing';
import type { TimingLineType } from '@/db/types';

const line = (type: TimingLineType) => ({ type });

describe('timing topology', () => {
  it('reads a single start/finish line as a closed circuit', () => {
    const lines = [line('start_finish'), line('sector'), line('sector')];

    expect(getTimingTopology(lines)).toBe('closed');
    expect(isTimingConfigured(lines)).toBe(true);
    // Two sector lines close three sectors against the start/finish.
    expect(getSectorCount(lines)).toBe(3);
  });

  it('reads a start plus a finish as point-to-point', () => {
    const lines = [line('start'), line('sector'), line('sector'), line('finish')];

    expect(getTimingTopology(lines)).toBe('point_to_point');
    expect(isTimingConfigured(lines)).toBe(true);
    // The finish line closes the third sector, exactly as a start/finish would.
    expect(getSectorCount(lines)).toBe(3);
  });

  it('treats a half-configured point-to-point track as untimed', () => {
    for (const half of [[line('start'), line('sector')], [line('finish'), line('sector')]]) {
      expect(getTimingTopology(half)).toBe('none');
      expect(isTimingConfigured(half)).toBe(false);
      // No closing sector is added, matching the long-standing behaviour for a
      // track that has sector lines but nothing to close the last one against.
      expect(getSectorCount(half)).toBe(1);
    }
  });

  it('reports no sectors when a track has no sector lines', () => {
    expect(getSectorCount([line('start_finish')])).toBe(0);
    expect(getSectorCount([line('start'), line('finish')])).toBe(0);
  });
});

describe('seeded timing topology', () => {
  const seeds = TRACK_SEED_DRAFTS;

  it('gives every seeded track a complete timing configuration', () => {
    for (const seed of seeds) {
      expect({
        slug: seed.track.slug,
        topology: getTimingTopology(seed.timingLines),
      }).not.toEqual({ slug: seed.track.slug, topology: 'none' });
    }
  });

  it('closes a path only when the timing topology is closed', () => {
    // Closure is a property of the layout, not of one known slug: a
    // point-to-point run starts and ends in different places.
    for (const seed of seeds) {
      if (!seed.track.path) {
        continue;
      }

      const path = seed.track.path;
      const isClosedPath =
        path[0][0] === path[path.length - 1][0] && path[0][1] === path[path.length - 1][1];

      expect({ slug: seed.track.slug, isClosedPath }).toEqual({
        slug: seed.track.slug,
        isClosedPath: getTimingTopology(seed.timingLines) === 'closed',
      });
    }
  });

  it('keeps Tsukuba 1000 on the main OSM course instead of the optional chicane', () => {
    const path = seeds.find((seed) => seed.track.id === 'tsukuba1000')?.track.path;
    const straightEntry: [number, number] = [36.150303, 139.924549];
    const straightExit: [number, number] = [36.149948, 139.924327];

    expect(path).toBeDefined();
    const entryIndex = path!.findIndex(
      ([latitude, longitude]) =>
        latitude === straightEntry[0] && longitude === straightEntry[1],
    );

    expect(entryIndex).toBeGreaterThanOrEqual(0);
    expect(path![entryIndex + 1]).toEqual(straightExit);
    expect(path).not.toContainEqual([36.150239, 139.924331]);
  });

  it('starts and ends a point-to-point path at its own timing lines', () => {
    const METERS_PER_DEGREE_LAT = 111132;

    function metresBetween(a: [number, number], b: { latitude: number; longitude: number }) {
      const scale = Math.cos((a[0] * Math.PI) / 180);
      return Math.hypot(
        (a[0] - b.latitude) * METERS_PER_DEGREE_LAT,
        (a[1] - b.longitude) * METERS_PER_DEGREE_LAT * scale,
      );
    }

    const pointToPoint = seeds.filter(
      (seed) => getTimingTopology(seed.timingLines) === 'point_to_point' && seed.track.path,
    );

    expect(pointToPoint.length).toBeGreaterThan(0);

    for (const seed of pointToPoint) {
      const path = seed.track.path!;
      const start = seed.timingLines.find((l) => l.type === 'start')!;
      const finish = seed.timingLines.find((l) => l.type === 'finish')!;
      const midpoint = (l: typeof start) => ({
        latitude: ((l.a.latitude ?? 0) + (l.b.latitude ?? 0)) / 2,
        longitude: ((l.a.longitude ?? 0) + (l.b.longitude ?? 0)) / 2,
      });

      // The drawn run must begin on its start line and end on its finish line.
      expect(metresBetween(path[0], midpoint(start))).toBeLessThan(30);
      expect(metresBetween(path[path.length - 1], midpoint(finish))).toBeLessThan(30);
    }
  });

  it('numbers timing lines so the start sorts first and the finish last', () => {
    for (const seed of seeds) {
      if (getTimingTopology(seed.timingLines) !== 'point_to_point') {
        continue;
      }

      const bySeq = [...seed.timingLines].sort((a, b) => a.seq - b.seq);

      expect(bySeq[0].type).toBe('start');
      expect(bySeq[bySeq.length - 1].type).toBe('finish');
    }
  });
});
