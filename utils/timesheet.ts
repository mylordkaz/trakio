import type { SessionDetail } from '@/db/sessions';
import { getTopSpeedKph } from '@/utils/session-analytics';
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
  bestLap: string;
  lapsLabel: string;
  topSpeed: string;
  condition: string | null;
};

type TimeSheetHtmlOptions = {
  timeZone?: string;
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
    .filter((lap) => !lap.isInvalid && !lap.isOutLap && !lap.isInLap)
    .sort((a, b) => a.lapTimeMs! - b.lapTimeMs!);
  const rankByLapId = new Map(ranked.map((lap, index) => [lap.id, index + 1]));

  const rows = laps.map((lap) => {
    const rank = rankByLapId.get(lap.id) ?? null;
    const sectorsByIndex = new Map(lap.sectors.map((sector) => [sector.sectorIndex, sector]));

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
        const split = sectorsByIndex.get(index);
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

function formatSheetDate(value: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(new Date(value));
  const dateParts = new Map(parts.map((part) => [part.type, part.value]));
  return `${dateParts.get('year')}-${dateParts.get('month')}-${dateParts.get('day')}`;
}

export function buildTimeSheetHtml(
  detail: SessionDetail,
  labels: TimeSheetLabels,
  options: TimeSheetHtmlOptions = {}
): string {
  const { rows, sectorCount } = buildTimeSheet(detail);
  const session = detail.session;
  const dateLabel = formatSheetDate(session.startedAt, options.timeZone);
  const condition = [
    labels.condition,
    session.temperatureC !== null ? `${session.temperatureC}°C` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' ');
  const metaParts = [
    session.name,
    session.car,
    condition || null,
  ].filter((part): part is string => Boolean(part));

  const best = rows.find((row) => row.isBest) ?? null;
  const topSpeed = getTopSpeedKph(detail);

  const sectorHeaders = Array.from(
    { length: sectorCount },
    (_, index) => `<th>${escapeHtml(labels.sectorPrefix)}${index + 1}</th>`
  ).join('');

  const bodyRows = rows
    .map((row) => {
      const lapTimeCell = `${row.isBest ? '<span class="b-mark">B</span> ' : ''}${row.lapTime}${
        row.isEstimated ? ' ≈' : ''
      }${row.rank !== null ? ` <span class="rank">(${row.rank})</span>` : ''}`;
      const sectorCells = row.sectors.map((sector) => `<td>${sector ?? ''}</td>`).join('');
      return `<tr${row.isBest ? ' class="best"' : ''}>
        <td class="lap-no">${row.lapNumber}${row.tag ? ` <span class="tag">${row.tag}</span>` : ''}</td>
        <td>${row.passingTime}</td>
        <td class="laptime">${lapTimeCell}</td>
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
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, 'Helvetica Neue', Helvetica, sans-serif; margin: 0; color: #18181b; }
  .header { padding: 34px 40px 18px; border-bottom: 2px solid #18181b; }
  .wordmark { font-size: 34px; font-weight: 900; font-style: italic; letter-spacing: 2px; }

  .header .sheet-title { margin-top: 4px; font-size: 12px; font-weight: 600; letter-spacing: 4px; color: #52525b; text-transform: uppercase; }
  .header .trackline { margin-top: 14px; font-size: 15px; font-weight: 700; color: #18181b; }
  .header .trackline .date { font-weight: 400; color: #52525b; }
  .header .meta { margin-top: 3px; font-size: 11px; color: #52525b; }
  .header .meta span + span::before { content: '  ·  '; color: #a1a1aa; }
  .content { padding: 26px 40px 30px; }
  .stats { display: flex; gap: 12px; margin-bottom: 24px; }
  .stat { flex: 1; border: 1px solid #e4e4e7; border-radius: 12px; padding: 12px 16px; }
  .stat .label { font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #71717a; }
  .stat .value { margin-top: 4px; font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  thead th { text-align: right; border-bottom: 2px solid #18181b; padding: 9px 10px; font-weight: 700; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; white-space: nowrap; }
  thead th:first-child { text-align: left; }
  td { text-align: right; border-bottom: 1px solid #f0f0f2; padding: 8px 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td:first-child { text-align: left; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  .lap-no { font-weight: 700; color: #52525b; }
  .laptime { font-weight: 600; }
  .rank { color: #71717a; font-weight: 400; }
  tr.best td { background: #eef0f3 !important; border-top: 1.5px solid #18181b; border-bottom: 1.5px solid #18181b; font-weight: 700; }
  tr.best .laptime { color: #18181b; }
  .b-mark { display: inline-block; background: #18181b; color: #ffffff; font-size: 9px; font-weight: 800; border-radius: 4px; padding: 1px 5px; vertical-align: 1px; }
  .tag { font-size: 8.5px; font-weight: 700; color: #a1a1aa; letter-spacing: 1px; }
  .footer { margin-top: 22px; display: flex; align-items: center; justify-content: space-between; }
  .legend { font-size: 9.5px; color: #71717a; }
  .footer .brand { font-size: 12px; font-weight: 900; font-style: italic; letter-spacing: 1.5px; color: #18181b; }

</style>
</head>
<body>
  <div class="header">
    <div class="wordmark">Trakio</div>
    <div class="sheet-title">${escapeHtml(labels.title)}</div>
    <div class="trackline">${escapeHtml(detail.track.name)} <span class="date">— ${dateLabel}</span></div>
    ${metaParts.length > 0 ? `<div class="meta">${metaParts.map((part) => `<span>${escapeHtml(part)}</span>`).join('')}</div>` : ''}
  </div>
  <div class="content">
    <div class="stats">
      <div class="stat hero">
        <div class="label">${escapeHtml(labels.bestLap)}</div>
        <div class="value">${best ? best.lapTime : '—'}</div>
      </div>
      <div class="stat">
        <div class="label">${escapeHtml(labels.lapsLabel)}</div>
        <div class="value">${rows.length}</div>
      </div>
      <div class="stat">
        <div class="label">${escapeHtml(labels.topSpeed)}</div>
        <div class="value">${topSpeed !== null ? `${topSpeed.toFixed(1)} km/h` : '—'}</div>
      </div>
    </div>
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
    <div class="footer">
      <div class="legend">${escapeHtml(labels.legend)}</div>
      <div class="brand">Trakio</div>
    </div>
  </div>
</body>
</html>`;
}
