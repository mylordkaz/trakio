import type { SessionDetail } from '@/db/sessions';
import { getSectorCount } from '@/utils/timing';

// Builds the lap time sheet exported for users, modeled on a circuit
// transponder printout: passing times from session start, lap times with
// ranks, per-sector splits, max speed. Pure data/HTML/CSV builders — the
// native print/share glue lives in services/timesheet-export.ts.

export type TimeSheetRow = {
  lapNumber: number;
  passingTime: string;
  lapTime: string;
  lapTimeMs: number;
  rank: number | null;
  isBest: boolean;
  isEstimated: boolean;
  tag: 'OUT' | 'IN' | null;
  sectors: (string | null)[];
  maxSpeedKph: string | null;
};

export type TimeSheetLabels = {
  title: string;
  lap: string;
  passingTime: string;
  lapTime: string;
  sectorPrefix: string;
  maxSpeed: string;
  legend: string;
};

// Circuit-sheet style duration: minutes'seconds.milliseconds (1'19.600).
export function formatSheetDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const rest = ms - minutes * 60000;
  const seconds = Math.floor(rest / 1000);
  const millis = Math.round(rest - seconds * 1000);
  return `${minutes}'${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function buildTimeSheet(detail: SessionDetail): { rows: TimeSheetRow[]; sectorCount: number } {
  const sectorCount = getSectorCount(detail.timingLines);
  const sessionStartMs = Date.parse(detail.session.startedAt);

  const laps = detail.laps
    .filter((lap) => lap.lapTimeMs !== null)
    .sort((a, b) => a.lapNumber - b.lapNumber);

  const ranked = laps
    .filter((lap) => !lap.isInvalid)
    .sort((a, b) => a.lapTimeMs! - b.lapTimeMs!);
  const rankByLapId = new Map(ranked.map((lap, index) => [lap.id, index + 1]));

  const rows = laps.map((lap) => {
    const rank = rankByLapId.get(lap.id) ?? null;
    const sortedSectors = [...lap.sectors].sort((a, b) => a.sectorIndex - b.sectorIndex);

    return {
      lapNumber: lap.lapNumber,
      passingTime: lap.endedAt ? formatSheetDuration(Date.parse(lap.endedAt) - sessionStartMs) : '',
      lapTime: formatSheetDuration(lap.lapTimeMs!),
      lapTimeMs: lap.lapTimeMs!,
      rank,
      isBest: rank === 1,
      isEstimated: lap.isTimingEstimated === 1,
      tag: lap.isOutLap === 1 ? ('OUT' as const) : lap.isInLap === 1 ? ('IN' as const) : null,
      sectors: Array.from({ length: sectorCount }, (_, index) => {
        const split = sortedSectors[index];
        return split ? (split.splitTimeMs / 1000).toFixed(3) : null;
      }),
      maxSpeedKph: lap.maxSpeedKph !== null ? lap.maxSpeedKph.toFixed(1) : null,
    };
  });

  return { rows, sectorCount };
}

export function buildTimeSheetCsv(detail: SessionDetail): string {
  const { rows, sectorCount } = buildTimeSheet(detail);
  const header = [
    'lap',
    'passing_time',
    'lap_time',
    'lap_time_ms',
    'rank',
    'estimated',
    'tag',
    ...Array.from({ length: sectorCount }, (_, index) => `sector_${index + 1}_s`),
    'max_speed_kph',
  ];

  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.lapNumber,
        row.passingTime,
        row.lapTime,
        row.lapTimeMs,
        row.rank ?? '',
        row.isEstimated ? 1 : 0,
        row.tag ?? '',
        ...row.sectors.map((sector) => sector ?? ''),
        row.maxSpeedKph ?? '',
      ].join(',')
    );
  }

  return lines.join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildTimeSheetHtml(detail: SessionDetail, labels: TimeSheetLabels): string {
  const { rows, sectorCount } = buildTimeSheet(detail);
  const session = detail.session;
  const dateLabel = new Date(session.startedAt).toISOString().slice(0, 10);
  const metaParts = [
    escapeHtml(detail.track.name),
    dateLabel,
    session.name ? escapeHtml(session.name) : null,
    session.car ? escapeHtml(session.car) : null,
    [session.condition, session.temperatureC !== null ? `${session.temperatureC}°C` : null]
      .filter(Boolean)
      .join(' '),
  ].filter((part) => part && part.length > 0);

  const sectorHeaders = Array.from(
    { length: sectorCount },
    (_, index) => `<th>${escapeHtml(labels.sectorPrefix)}${index + 1}</th>`
  ).join('');

  const bodyRows = rows
    .map((row) => {
      const lapTimeCell = `${row.isBest ? 'B ' : ''}${row.lapTime}${row.isEstimated ? ' ≈' : ''}${
        row.rank !== null ? ` (${row.rank})` : ''
      }`;
      const sectorCells = row.sectors
        .map((sector) => `<td>${sector ?? ''}</td>`)
        .join('');
      return `<tr${row.isBest ? ' class="best"' : ''}>
        <td>${row.lapNumber}${row.tag ? ` <span class="tag">${row.tag}</span>` : ''}</td>
        <td>${row.passingTime}</td>
        <td>${lapTimeCell}</td>
        ${sectorCells}
        <td>${row.maxSpeedKph ?? ''}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, 'Helvetica Neue', Helvetica, sans-serif; padding: 36px; color: #111; }
  h1 { font-size: 19px; margin: 0 0 4px; letter-spacing: 1.5px; }
  .meta { margin: 0 0 22px; font-size: 12px; color: #444; }
  .meta span + span::before { content: ' · '; color: #999; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: right; border-bottom: 2px solid #111; padding: 7px 8px; font-weight: 600; white-space: nowrap; }
  td { text-align: right; border-bottom: 1px solid #ddd; padding: 7px 8px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  tr.best td { font-weight: 700; }
  .tag { font-size: 9px; color: #666; }
  .legend { margin-top: 18px; font-size: 10px; color: #666; }
  .brand { margin-top: 6px; font-size: 10px; color: #999; letter-spacing: 1px; }
</style>
</head>
<body>
  <h1>${escapeHtml(labels.title)}</h1>
  <div class="meta">${metaParts.map((part) => `<span>${part}</span>`).join('')}</div>
  <table>
    <thead>
      <tr>
        <th>${escapeHtml(labels.lap)}</th>
        <th>${escapeHtml(labels.passingTime)}</th>
        <th>${escapeHtml(labels.lapTime)}</th>
        ${sectorHeaders}
        <th>${escapeHtml(labels.maxSpeed)}</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="legend">${escapeHtml(labels.legend)}</div>
  <div class="brand">TRAKIO</div>
</body>
</html>`;
}
