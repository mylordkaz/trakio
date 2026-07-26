// Qstarz BL-1000GT / BL-818GT BLE protocol (docs/external_gps/qstarz).

// Same Nordic UART service UUID as RaceBox, so the service cannot identify the
// vendor — classification relies on the QSTARZ1/QSTARZ2 name prefixes.
export const QSTARZ_UART_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
// The device exposes two notify characteristics and the vendor docs never say
// which one carries the GNSS stream. Both are probed on connect; the first to
// produce a structurally valid record becomes the stream.
export const QSTARZ_TX_CANDIDATE_CHARACTERISTIC_UUIDS: readonly string[] = [
  '6E400003-B5A3-F393-E0A9-E50E24DCCA9E',
  '6E400004-B5A3-F393-E0A9-E50E24DCCA9E',
];

// The device streams records (fixed or not) as soon as notifications are on,
// so a silent probe window this long means no GNSS stream exists on any
// candidate characteristic.
export const STREAM_PROBE_TIMEOUT_MS = 8000;

// Updates are fragmented into 20-byte notifications; any other length ends the
// update. A GNSS record is 58 bytes; when GSV satellite data follows, the
// record is zero-padded to 60 bytes and one GSV packet (1/7/13/19 bytes)
// trails it in the next notification.
export const NOTIFICATION_FRAGMENT_LENGTH = 20;
export const GNSS_RECORD_LENGTH = 58;
export const GSV_PADDED_RECORD_LENGTH = 60;
export const GSV_PACKET_LENGTHS: readonly number[] = [1, 7, 13, 19];
export const MAX_UPDATE_LENGTH = 79;

export const FIX_STATUS_3D = 3;

// Fix quality (byte 54) values above 8 don't exist in the protocol; qualities
// 6/7/8 (dead reckoning, manual input, simulation) exist but are not
// satellite fixes — laps must not be timed on them. Usable: 1-5 (GPS, DGPS,
// PPS, RTK, float RTK).
export const MAX_FIX_QUALITY = 8;
export const USABLE_FIX_QUALITY_MIN = 1;
export const USABLE_FIX_QUALITY_MAX = 5;

// The record reports DOP but no meter accuracy; horizontal 1-sigma error is
// approximated as HDOP x a nominal user-equivalent range error.
export const HDOP_TO_ACCURACY_M = 3;

// A 3D fix carries GNSS-derived time; values outside this window mean the
// record bytes are not what they claim to be (the protocol has no checksum).
// Unfixed devices report RTC garbage here, which is fine — those records are
// rejected on fix status alone.
export const EARLIEST_VALID_FIX_UNIX_SECONDS = 1420070400; // 2015-01-01
export const LATEST_VALID_FIX_UNIX_SECONDS = 4102444800; // 2100-01-01

// Battery is not in the GNSS record; the device advertises the standard
// Battery Service instead.
export const BATTERY_SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb';
export const BATTERY_LEVEL_CHARACTERISTIC_UUID = '00002a19-0000-1000-8000-00805f9b34fb';
export const BATTERY_REFRESH_INTERVAL_MS = 60000;
