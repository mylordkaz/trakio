import { encodePacket } from '@/telemetry/sources/ubx/packet-writer';
import {
  NAV_CLASS,
  NAV_PVT_ID,
  ACK_CLASS,
  ACK_ACK_ID,
  ACK_NAK_ID,
  CFG_CLASS,
  CFG_VALSET_ID,
} from '@/telemetry/sources/ubx/constants';
import { NAV_PVT_PAYLOAD_LENGTH } from '@/telemetry/sources/dragy/constants';

export { hexToBytes, bytesToHex } from '@/telemetry/sources/ubx/__tests__/helpers';

// Command and reply frames copied from "Dragy BLE Protocol Documentation v0.2"
// (§3.2-3.4). Replies are printed there without the B5 62 sync word; it is
// restored here because the device frames them as full UBX packets.
export const DOC_PERFORMANCE_MODE_QUERY_HEX =
  'b562068b1400000400000100a4400300a4400500a4400a00a4404c15';
export const DOC_PERFORMANCE_MODE_REPLY_HEX =
  'b562068b2400010400000100a44000b0710b0300a44000b0710b0500a44000b0710b0a00a44000d8b8057681';
export const DOC_FOUR_GNSS_CONFIG_HEX =
  'b562068a2200000300001f003110012100311001' +
  '0d003110000f0031100122003110012500311001e34c';
export const DOC_RATE_QUERY_HEX = 'b562068b08000000000001002130eb07';
export const DOC_RATE_REPLY_10HZ_HEX = 'b562068b0a000100000001002130640052c7';
export const DOC_RATE_REPLY_20HZ_HEX = 'b562068b0a00010000000100213032002063';
export const DOC_RATE_REPLY_25HZ_HEX = 'b562068b0a0001000000010021302800164f';
export const DOC_RATE_SET_10HZ_HEX = 'b562068a0a000003000001002130640053cb';
export const DOC_RATE_SET_20HZ_HEX = 'b562068a0a00000300000100213032002167';
export const DOC_RATE_SET_25HZ_HEX = 'b562068a0a00000300000100213028001753';

export type NavPvtFields = {
  iTOW: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  validityFlags: number;
  timeAccuracyNs: number;
  nanosecond: number;
  fixType: number;
  fixFlags: number;
  flags2: number;
  numSV: number;
  longitude: number;
  latitude: number;
  wgsAltitude: number;
  mslAltitude: number;
  horizontalAccuracy: number;
  verticalAccuracy: number;
  velN: number;
  velE: number;
  velD: number;
  groundSpeed: number;
  headingOfMotion: number;
  speedAccuracy: number;
  headingAccuracy: number;
  pdop: number;
  flags3: number;
};

// A plausible lap at Tsukuba, 2026-07-26 03:20:00.400 UTC, 132.5 km/h.
export const BASE_NAV_PVT: NavPvtFields = {
  iTOW: 12345678,
  year: 2026,
  month: 7,
  day: 26,
  hour: 3,
  minute: 20,
  second: 0,
  validityFlags: 0x07,
  timeAccuracyNs: 50,
  nanosecond: 400_000_000,
  fixType: 3,
  fixFlags: 0x01,
  flags2: 0xe0,
  numSV: 14,
  longitude: 1400917000,
  latitude: 361513000,
  wgsAltitude: 60000,
  mslAltitude: 28400,
  horizontalAccuracy: 924,
  verticalAccuracy: 1500,
  velN: -30000,
  velE: -21000,
  velD: 100,
  groundSpeed: 36806,
  headingOfMotion: 21470000,
  speedAccuracy: 250,
  headingAccuracy: 150000,
  pdop: 180,
  flags3: 0x0000,
};

export function buildNavPvtPayload(overrides: Partial<NavPvtFields> = {}): Uint8Array {
  const f = { ...BASE_NAV_PVT, ...overrides };
  const bytes = new Uint8Array(NAV_PVT_PAYLOAD_LENGTH);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, f.iTOW, true);
  view.setUint16(4, f.year, true);
  view.setUint8(6, f.month);
  view.setUint8(7, f.day);
  view.setUint8(8, f.hour);
  view.setUint8(9, f.minute);
  view.setUint8(10, f.second);
  view.setUint8(11, f.validityFlags);
  view.setUint32(12, f.timeAccuracyNs, true);
  view.setInt32(16, f.nanosecond, true);
  view.setUint8(20, f.fixType);
  view.setUint8(21, f.fixFlags);
  view.setUint8(22, f.flags2);
  view.setUint8(23, f.numSV);
  view.setInt32(24, f.longitude, true);
  view.setInt32(28, f.latitude, true);
  view.setInt32(32, f.wgsAltitude, true);
  view.setInt32(36, f.mslAltitude, true);
  view.setUint32(40, f.horizontalAccuracy, true);
  view.setUint32(44, f.verticalAccuracy, true);
  view.setInt32(48, f.velN, true);
  view.setInt32(52, f.velE, true);
  view.setInt32(56, f.velD, true);
  view.setInt32(60, f.groundSpeed, true);
  view.setInt32(64, f.headingOfMotion, true);
  view.setUint32(68, f.speedAccuracy, true);
  view.setUint32(72, f.headingAccuracy, true);
  view.setUint16(76, f.pdop, true);
  view.setUint16(78, f.flags3, true);

  return bytes;
}

export function frameNavPvt(payload: Uint8Array = buildNavPvtPayload()): Uint8Array {
  return encodePacket(NAV_CLASS, NAV_PVT_ID, payload);
}

export function frameAck(): Uint8Array {
  return encodePacket(ACK_CLASS, ACK_ACK_ID, Uint8Array.from([CFG_CLASS, CFG_VALSET_ID]));
}

export function frameNak(): Uint8Array {
  return encodePacket(ACK_CLASS, ACK_NAK_ID, Uint8Array.from([CFG_CLASS, CFG_VALSET_ID]));
}

// Splits a frame the way BLE notifications deliver it.
export function fragment(bytes: Uint8Array, size: number): Uint8Array[] {
  const parts: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) {
    parts.push(bytes.slice(i, i + size));
  }
  return parts;
}
