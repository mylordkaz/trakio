// Reference sequences from the Qstarz protocol docs (docs/external_gps/qstarz):
// each hex string is one BLE notification payload exactly as captured.

// BL-1000GT, 3D fix (SI doc rev V6, 16:10:06.834): 20+20+18 bytes, no GSV.
// Decodes to 25.0691°N 121.5905°E, 2018-08-10T08:10:06.700Z.
export const GOLDEN_FIXED_FRAGMENTS_HEX = [
  '0354bc02d2fe07584b90a3402c103d29b7b3c740',
  '5e486d5b9e29343f6da71b43aec72a4335000700',
  '08ff0f00000010400ad7a33f150401640000',
];

// BL-1000GT, 3D fix followed by GSV data (SI doc rev V6, 16:10:07.163):
// 20+20+20 bytes (record zero-padded to 60), then a 19-byte GSV packet.
export const GOLDEN_GSV_UPDATE_FRAGMENTS_HEX = [
  '0354000092088d604b90a340df1ad82ab7b3c740',
  '5f486d5b6ff0253fdb991b4348a12b4337000500',
  '07ff0c00000010400ad7a33f1504016400000000',
  '075703008e0000440300df0000410500210000',
];

// BL-818GT, no fix (packet doc capture, 14:27:27.233): 20+20+18 bytes.
export const UNFIXED_818GT_FRAGMENTS_HEX = [
  '0154830300000000000000800000000000000080',
  'ced1c469000000000000000000000000f4ffe3ff',
  '050100000000000000000000000000640000',
];

// BL-1000GT, no fix with a standalone <00> "no GSV data" terminator
// (packet doc capture, 16:11:51.929): 20+20+20 bytes, then 1 byte.
// The unfixed RTC reads as year 2080 — real capture garbage.
export const UNFIXED_GSV_TERMINATOR_FRAGMENTS_HEX = [
  '0154200300000000000000800000000000000080',
  '0d51eece00000000000000000000000001000000',
  'ff00000000000000000000000000006400000000',
  '00',
];

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export type GnssRecordFields = {
  fixStatus: number;
  milliseconds: number;
  latDdmm: number;
  lonDdmm: number;
  unixSeconds: number;
  speedKmh: number;
  heightM: number;
  headingDeg: number;
  gForceX: number;
  gForceY: number;
  gForceZ: number;
  maxSnr: number;
  horizontalAccuracyM: number;
  verticalAccuracyM: number;
  satellitesInView: number;
  satellitesUsed: number;
  fixQuality: number;
};

// A plausible lap at Tsukuba: 36.1513°N 140.0917°E in DDDMM.MMMM terms.
const BASE_FIXED_RECORD: GnssRecordFields = {
  fixStatus: 3,
  milliseconds: 400,
  latDdmm: 3609.08034,
  lonDdmm: 14005.49984,
  unixSeconds: 1753500000,
  speedKmh: 132.5,
  heightM: 28.4,
  headingDeg: 214.7,
  gForceX: 90,
  gForceY: -64,
  gForceZ: -260,
  maxSnr: 45,
  horizontalAccuracyM: 0.8,
  verticalAccuracyM: 1.1,
  satellitesInView: 18,
  satellitesUsed: 12,
  fixQuality: 1,
};

export function buildGnssRecord(overrides: Partial<GnssRecordFields> = {}): Uint8Array {
  const fields = { ...BASE_FIXED_RECORD, ...overrides };
  const bytes = new Uint8Array(58);
  const view = new DataView(bytes.buffer);

  view.setUint8(0, fields.fixStatus);
  // RCR byte: 0x54 ('T') in every vendor capture.
  view.setUint8(1, 0x54);
  view.setUint16(2, fields.milliseconds, true);
  view.setFloat64(4, fields.latDdmm, true);
  view.setFloat64(12, fields.lonDdmm, true);
  view.setUint32(20, fields.unixSeconds, true);
  view.setFloat32(24, fields.speedKmh, true);
  view.setFloat32(28, fields.heightM, true);
  view.setFloat32(32, fields.headingDeg, true);
  view.setInt16(36, fields.gForceX, true);
  view.setInt16(38, fields.gForceY, true);
  view.setInt16(40, fields.gForceZ, true);
  view.setUint16(42, fields.maxSnr, true);
  view.setFloat32(44, fields.horizontalAccuracyM, true);
  view.setFloat32(48, fields.verticalAccuracyM, true);
  view.setUint8(52, fields.satellitesInView);
  view.setUint8(53, fields.satellitesUsed);
  view.setUint8(54, fields.fixQuality);
  view.setUint8(55, 100);

  return bytes;
}

// Splits a 58-byte record the way the device transmits it without GSV data.
export function fragmentRecord(record: Uint8Array): Uint8Array[] {
  return [record.slice(0, 20), record.slice(20, 40), record.slice(40)];
}

// Zero-pads a 58-byte record to 60 and appends one trailing GSV notification,
// the way the device transmits it when satellite data follows.
export function padAndFragmentRecord(
  record: Uint8Array,
  gsvPacket: Uint8Array
): Uint8Array[] {
  const padded = new Uint8Array(60);
  padded.set(record);
  return [padded.slice(0, 20), padded.slice(20, 40), padded.slice(40), gsvPacket];
}
