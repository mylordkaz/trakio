import * as Print from 'expo-print';
import { getCalendars } from 'expo-localization';
import { Platform } from 'react-native';
import Share from 'react-native-share';
import type { SessionDetail } from '@/db/sessions';
import i18n from '@/i18n';
import { utf8ToBase64 } from '@/utils/base64';
import { buildTimeSheetCsv, buildTimeSheetHtml, type TimeSheetLabels } from '@/utils/timesheet';
import { getTrackDisplayTitle, localizeTrack } from '@/utils/track-localization';

// User-facing session export: a lap time sheet as PDF or CSV. The raw JSON
// export (services/share.ts) stays developer-only behind a long-press.

type ExportResult = { ok: true } | { ok: false; message: string };

const WEATHER_CONDITION_KEYS = ['clear', 'cloudy', 'rain', 'fog', 'snow', 'storm'] as const;

function isUserCancel(message: string) {
  return message.includes('User did not share');
}

function localizeCondition(condition: string | null): string | null {
  if (!condition || condition === 'unknown') {
    return null;
  }

  return (WEATHER_CONDITION_KEYS as readonly string[]).includes(condition)
    ? i18n.t(`preSession.${condition}`)
    : condition;
}

function sheetLabels(detail: SessionDetail): TimeSheetLabels {
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
    condition: localizeCondition(detail.session.condition),
  };
}

function withLocalizedTrack(detail: SessionDetail): SessionDetail {
  return {
    ...detail,
    track: {
      ...localizeTrack(detail.track, i18n.locale),
      name: getTrackDisplayTitle(detail.track, i18n.locale),
    },
  };
}

export async function exportSessionTimeSheetPdf(detail: SessionDetail): Promise<ExportResult> {
  try {
    const displayDetail = withLocalizedTrack(detail);
    const { uri } = await Print.printToFileAsync({
      html: buildTimeSheetHtml(displayDetail, sheetLabels(detail), {
        timeZone: getCalendars()[0]?.timeZone ?? undefined,
      }),
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
    const filenameStem = `trakio-timesheet-${detail.session.id}`;

    const shareOptions = {
      url: `data:text/csv;base64,${utf8ToBase64(csv)}`,
      // Android derives and appends the extension for base64 shares; iOS
      // writes the provided filename verbatim.
      filename: Platform.OS === 'android' ? filenameStem : `${filenameStem}.csv`,
      type: 'text/csv',
      failOnCancel: false,
      useInternalStorage: true,
    } satisfies Parameters<typeof Share.open>[0] & { useInternalStorage?: boolean };

    // react-native-share supports this Android option natively, although its
    // ShareOptions declaration currently omits it.
    await Share.open(shareOptions);

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return isUserCancel(message) ? { ok: true } : { ok: false, message };
  }
}
