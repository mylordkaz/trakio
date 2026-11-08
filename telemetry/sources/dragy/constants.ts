// Dragy DRG70 / DRGPR / DRGLT BLE protocol (docs/external_gps/dragy).

export const DRAGY_SERVICE_UUID = '0000fd00-0000-1000-8000-00805f9b34fb';
// Commands go in here; their replies come back on the stream characteristic.
export const DRAGY_COMMAND_CHARACTERISTIC_UUID = '0000fd01-0000-1000-8000-00805f9b34fb';
export const DRAGY_STREAM_CHARACTERISTIC_UUID = '0000fd02-0000-1000-8000-00805f9b34fb';
// Absent on DRGLT, which streams without a handshake.
export const DRAGY_HANDSHAKE_CHARACTERISTIC_UUID = '0000fd03-0000-1000-8000-00805f9b34fb';
// Read-only, 2 bytes; the second byte is the charge percentage.
export const DRAGY_BATTERY_CHARACTERISTIC_UUID = '0000fd04-0000-1000-8000-00805f9b34fb';

export const HANDSHAKE_CHALLENGE_LENGTH = 2;
export const HANDSHAKE_RESPONSE_LENGTH = 4;

// The vendor promises every config reply within 2 seconds.
export const CONFIG_RESPONSE_TIMEOUT_MS = 2000;
// A device that accepted the handshake streams fix-or-not; this long a silence means it did not.
export const STREAM_PROBE_TIMEOUT_MS = 8000;
// Battery is not in the stream and the characteristic has no notify.
export const BATTERY_POLL_INTERVAL_MS = 60000;
export const MAX_BATTERY_PERCENT = 100;

export const NAV_PVT_PAYLOAD_LENGTH = 92;

// Performance Mode detection, as given by the vendor. The layer (4) and the
// 0x40A4 key group are Dragy-proprietary and absent from the u-blox M10
// interface description, so the reply is matched byte-for-byte rather than
// decoded. Activation (UBX-CFG-OTP) is a permanent write and is never sent.
export const PERFORMANCE_MODE_QUERY_PAYLOAD = Uint8Array.from([
  0x00, 0x04, 0x00, 0x00,
  0x01, 0x00, 0xa4, 0x40,
  0x03, 0x00, 0xa4, 0x40,
  0x05, 0x00, 0xa4, 0x40,
  0x0a, 0x00, 0xa4, 0x40,
]);
export const PERFORMANCE_MODE_REPLY_PAYLOAD = Uint8Array.from([
  0x01, 0x04, 0x00, 0x00,
  0x01, 0x00, 0xa4, 0x40, 0x00, 0xb0, 0x71, 0x0b,
  0x03, 0x00, 0xa4, 0x40, 0x00, 0xb0, 0x71, 0x0b,
  0x05, 0x00, 0xa4, 0x40, 0x00, 0xb0, 0x71, 0x0b,
  0x0a, 0x00, 0xa4, 0x40, 0x00, 0xd8, 0xb8, 0x05,
]);

// CFG-VALGET / CFG-VALSET header bytes (u-blox M10 SPG 5.10 §3.10.4-5).
export const VALGET_VERSION = 0x00;
export const VALGET_REPLY_VERSION = 0x01;
export const VALGET_LAYER_RAM = 0x00;
export const VALSET_VERSION = 0x00;
// Bit 0 RAM, bit 1 BBR: applied now and kept while the device has power.
export const VALSET_LAYERS_RAM_BBR = 0x03;

// CFG-RATE-MEAS: nominal time between GNSS measurements, U2 milliseconds.
export const CFG_RATE_MEAS_KEY = 0x30210001;
export const TARGET_MEAS_PERIOD_MS = 40;

// Four-GNSS: GPS + Galileo + BeiDou B1C + GLONASS, in the vendor's key order.
export const FOUR_GNSS_SIGNALS: readonly { key: number; enabled: boolean }[] = [
  { key: 0x1031001f, enabled: true }, // CFG-SIGNAL-GPS_ENA
  { key: 0x10310021, enabled: true }, // CFG-SIGNAL-GAL_ENA
  { key: 0x1031000d, enabled: false }, // CFG-SIGNAL-BDS_B1_ENA
  { key: 0x1031000f, enabled: true }, // CFG-SIGNAL-BDS_B1C_ENA
  { key: 0x10310022, enabled: true }, // CFG-SIGNAL-BDS_ENA
  { key: 0x10310025, enabled: true }, // CFG-SIGNAL-GLO_ENA
];
