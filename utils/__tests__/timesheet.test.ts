import type { SessionDetail } from '@/db/sessions';
import { buildTimeSheet, buildTimeSheetCsv, buildTimeSheetHtml, formatSheetDuration } from '@/utils/timesheet';

const T0 = '2026-07-19T06:30:00.000Z';
const iso = (offsetS: number) => new Date(Date.parse(T0) + offsetS * 1000).toISOString();

function lapFixture(n: number, startedS: number, timeMs: number | null, extra: Record<string, unknown> = {}) {
  const sectorA = timeMs === null ? 0 : Math.round(timeMs * 0.4);
  return {
    id: `lap-${n}`,
    sessionId: 's1',
    lapNumber: n,
    startedAt: iso(startedS),
    startedLatitude: null,
    startedLongitude: null,
    endedAt: timeMs === null ? null : iso(startedS + timeMs / 1000),
    lapTimeMs: timeMs,
    isOutLap: 0,
    isInLap: 0,
    isTimingEstimated: 0,
    isInvalid: 0,
    maxSpeedKph: 150 + n,
    createdAt: T0,
    sectors:
      timeMs === null
        ? []
        : [
            { id: `${n}-0`, lapId: `lap-${n}`, sectorIndex: 0, splitTimeMs: sectorA, createdAt: T0 },
            { id: `${n}-1`, lapId: `lap-${n}`, sectorIndex: 1, splitTimeMs: sectorA, createdAt: T0 },
            { id: `${n}-2`, lapId: `lap-${n}`, sectorIndex: 2, splitTimeMs: timeMs - 2 * sectorA, createdAt: T0 },
          ],
    ...extra,
  };
}

const DETAIL = {
  session: {
    id: 's1',
    name: 'Morning Session',
    startedAt: T0,
    car: 'S2000',
    condition: 'Dry',
    temperatureC: 28,
  },
  track: { name: 'Tsukuba Circuit 2000' },
  timingLines: [{ type: 'start_finish' }, { type: 'sector' }, { type: 'sector' }],
  laps: [
    lapFixture(1, 60, 82000, { isOutLap: 1 }),
    lapFixture(2, 142, 79600),
    lapFixture(3, 221.6, 81000, { isTimingEstimated: 1 }),
    lapFixture(4, 302.6, null, { isInLap: 1 }), // unfinished in-lap: no row
  ],
  gpsPoints: [],
  notes: [],
  displayStatus: 'saved',
} as unknown as SessionDetail;

describe('time sheet builders', () => {
  it('formats durations circuit-sheet style', () => {
    expect(formatSheetDuration(79600)).toBe("1'19.600");
    expect(formatSheetDuration(61000)).toBe("1'01.000");
    expect(formatSheetDuration(161373)).toBe("2'41.373");
  });

  it('builds ranked rows with tags, flags, and positional sectors', () => {
    const { rows, sectorCount } = buildTimeSheet(DETAIL);

    expect(sectorCount).toBe(3);
    expect(rows).toHaveLength(3); // the unfinished lap has no row

    const [l1, l2, l3] = rows;
    expect(l1.tag).toBe('OUT');
    expect(l1.rank).toBe(3);
    expect(l2.isBest).toBe(true);
    expect(l2.rank).toBe(1);
    expect(l2.lapTime).toBe("1'19.600");
    expect(l3.isEstimated).toBe(true);
    expect(l3.rank).toBe(2);

    // Passing time = lap end relative to session start (out-lap 60 s + 82 s).
    expect(l1.passingTime).toBe("2'22.000");

    // Sectors are positional and sum to the lap.
    expect(l2.sectors).toHaveLength(3);
    const sum = l2.sectors.reduce((acc, s) => acc + Number(s), 0);
    expect(sum).toBeCloseTo(79.6, 3);
  });

  it('emits a CSV with dynamic sector columns and raw milliseconds', () => {
    const csv = buildTimeSheetCsv(DETAIL);
    const lines = csv.split('\n');

    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(
      'lap,passing_time,lap_time,lap_time_ms,rank,estimated,tag,sector_1_s,sector_2_s,sector_3_s,max_speed_kph'
    );
    expect(lines[2]).toContain(",1'19.600,79600,1,0,,");
    expect(lines[1]).toContain(',OUT,');
  });

  it('renders the PDF html with best marker, estimate flag, and escaped meta', () => {
    const html = buildTimeSheetHtml(
      { ...DETAIL, session: { ...DETAIL.session, name: 'A <b>&</b> B' } } as SessionDetail,
      {
        title: 'LAP TIME SHEET',
        lap: 'Lap',
        passingTime: 'Passing Time',
        lapTime: 'Lap Time',
        sectorPrefix: 'Sec',
        maxSpeed: 'km/h',
        legend: 'B = best lap',
      }
    );

    expect(html).toContain("B 1'19.600");
    expect(html).toContain('(1)');
    expect(html).toContain('≈');
    expect(html).toContain('class="best"');
    expect(html).toContain('Sec3</th>');
    expect(html).toContain('Tsukuba Circuit 2000');
    expect(html).toContain('A &lt;b&gt;&amp;&lt;/b&gt; B');
    expect(html).not.toContain('<b>&</b>');
  });
});
