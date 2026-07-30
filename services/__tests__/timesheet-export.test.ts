import type { SessionDetail } from '@/db/sessions';

type PrintOptions = { html: string };
type ShareOptions = Record<string, unknown>;

const mockPrintToFileAsync = jest.fn(async (_options: PrintOptions) => ({
  uri: 'file:///tmp/generated.pdf',
}));
const mockShareOpen = jest.fn(async (_options: ShareOptions) => ({}));

jest.mock('expo-print', () => ({
  printToFileAsync: (options: PrintOptions) => mockPrintToFileAsync(options),
}));

jest.mock('expo-localization', () => ({
  getCalendars: () => [{ timeZone: 'Asia/Tokyo' }],
  getLocales: () => [{ languageCode: 'ja', languageTag: 'ja-JP' }],
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

jest.mock('react-native-share', () => ({
  __esModule: true,
  default: { open: (options: ShareOptions) => mockShareOpen(options) },
}));

import {
  exportSessionTimeSheetCsv,
  exportSessionTimeSheetPdf,
} from '@/services/timesheet-export';

const DETAIL = {
  session: {
    id: 'session-1',
    name: 'Morning Session',
    car: 'S2000',
    condition: 'clear',
    temperatureC: 20,
    startedAt: '2026-03-13T23:30:00.000Z',
    maxSpeedKph: 180,
  },
  track: {
    id: 'tsukuba2000',
    name: 'Tsukuba 2000',
    country: 'Japan',
    location: 'Tsukuba',
    layoutName: 'TS2000',
  },
  timingLines: [],
  laps: [],
  gpsPoints: [],
  notes: [],
  displayStatus: 'saved',
} as unknown as SessionDetail;

describe('time sheet export', () => {
  beforeEach(() => {
    mockPrintToFileAsync.mockClear();
    mockShareOpen.mockClear();
  });

  it('shares base64 CSV from internal storage with an Android-safe filename', async () => {
    await expect(exportSessionTimeSheetCsv(DETAIL)).resolves.toEqual({ ok: true });

    expect(mockShareOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'trakio-timesheet-session-1',
        type: 'text/csv',
        useInternalStorage: true,
        url: expect.stringMatching(/^data:text\/csv;base64,/),
      })
    );
  });

  it('uses the device timezone and localized weather in the PDF HTML', async () => {
    await expect(exportSessionTimeSheetPdf(DETAIL)).resolves.toEqual({ ok: true });

    const [{ html }] = mockPrintToFileAsync.mock.calls[0];
    expect(html).toContain('2026-03-14');
    expect(html).toContain('晴れ 20°C');
    expect(html).toContain('筑波サーキット コース2000');
    expect(html).not.toContain('>Tsukuba 2000 ');
    expect(html).not.toContain('>clear 20°C<');
    expect(mockShareOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'file:///tmp/generated.pdf',
        type: 'application/pdf',
      })
    );
  });
});
