// Qstarz BL-1000GT / BL-818GT BLE protocol (docs/external_gps/qstarz).

// Same NUS service UUID as RaceBox; the name prefix is the only vendor discriminator.
export const QSTARZ_UART_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
// Docs never name the GNSS characteristic; both notify chars are probed, first valid record wins.
export const QSTARZ_TX_CANDIDATE_CHARACTERISTIC_UUIDS: readonly string[] = [
  '6E400003-B5A3-F393-E0A9-E50E24DCCA9E',
  '6E400004-B5A3-F393-E0A9-E50E24DCCA9E',
];

// Devices stream records fix-or-not immediately, so this long a silence means no stream.
export const STREAM_PROBE_TIMEOUT_MS = 8000;

// 20-byte fragments; any other notification length ends the update.
export const NOTIFICATION_FRAGMENT_LENGTH = 20;
export const GNSS_RECORD_LENGTH = 58;
export const GSV_PADDED_RECORD_LENGTH = 60;
export const GSV_PACKET_LENGTHS: readonly number[] = [1, 7, 13, 19];
export const MAX_UPDATE_LENGTH = 79;

export const FIX_STATUS_3D = 3;

// Usable qualities are 1-5; 6/7/8 (DR/manual/simulation) are not satellite fixes.
export const MAX_FIX_QUALITY = 8;
export const USABLE_FIX_QUALITY_MIN = 1;
export const USABLE_FIX_QUALITY_MAX = 5;

// A 3D fix outside this window is a misframed record (unfixed RTC garbage is gated on fix status).
export const EARLIEST_VALID_FIX_UNIX_SECONDS = 1420070400; // 2015-01-01
export const LATEST_VALID_FIX_UNIX_SECONDS = 4102444800; // 2100-01-01

// Battery is not in the GNSS record; read from the standard Battery Service.
export const BATTERY_SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb';
export const BATTERY_LEVEL_CHARACTERISTIC_UUID = '00002a19-0000-1000-8000-00805f9b34fb';
export const BATTERY_REFRESH_INTERVAL_MS = 60000;
