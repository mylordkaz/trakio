import * as Print from 'expo-print';
import Share from 'react-native-share';
import type { SessionDetail } from '@/db/sessions';
import i18n from '@/i18n';
import { utf8ToBase64 } from '@/utils/base64';
import { buildTimeSheetCsv, buildTimeSheetHtml, type TimeSheetLabels } from '@/utils/timesheet';

// User-facing session export: a lap time sheet as PDF or CSV. The raw JSON
// export (services/share.ts) stays developer-only behind a long-press.

type ExportResult = { ok: true } | { ok: false; message: string };

function isUserCancel(message: string) {
  return message.includes('User did not share');
}

function sheetLabels(): TimeSheetLabels {
  return {
    title: i18n.t('sessions.timeSheetTitle'),
    lap: i18n.t('sessions.timeSheetLap'),
    passingTime: i18n.t('sessions.timeSheetPassingTime'),
    lapTime: i18n.t('sessions.timeSheetLapTime'),
    sectorPrefix: i18n.t('sessions.timeSheetSectorPrefix'),
    maxSpeed: 'km/h',
    legend: i18n.t('sessions.timeSheetLegend'),
    bestLap: i18n.t('sessions.storyBestLap'),
    lapsLabel: i18n.t('sessions.laps'),
    topSpeed: i18n.t('sessions.timeSheetTopSpeed'),
  };
}

export async function exportSessionTimeSheetPdf(detail: SessionDetail): Promise<ExportResult> {
  try {
    const { uri } = await Print.printToFileAsync({
      html: buildTimeSheetHtml(detail, sheetLabels()),
    });

    await Share.open({
      url: uri,
      filename: `trakio-timesheet-${detail.session.id}.pdf`,
      type: 'application/pdf',
      failOnCancel: false,
    });

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return isUserCancel(message) ? { ok: true } : { ok: false, message };
  }
}

export async function exportSessionTimeSheetCsv(detail: SessionDetail): Promise<ExportResult> {
  try {
    const csv = buildTimeSheetCsv(detail);

    await Share.open({
      url: `data:text/csv;base64,${utf8ToBase64(csv)}`,
      filename: `trakio-timesheet-${detail.session.id}.csv`,
      type: 'text/csv',
      failOnCancel: false,
    });

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return isUserCancel(message) ? { ok: true } : { ok: false, message };
  }
}
