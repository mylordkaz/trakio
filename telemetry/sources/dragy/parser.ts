import type { ExtendedTelemetrySample, TelemetryElapsedMsResolver } from '@/telemetry/types';
import { utcFieldsToRecordedAt, normalizeHeading } from '@/telemetry/sources/ubx/nav-fields';
import {
  NAV_PVT_PAYLOAD_LENGTH,
  PERFORMANCE_MODE_REPLY_PAYLOAD,
  VALGET_REPLY_VERSION,
  CFG_RATE_MEAS_KEY,
} from '@/telemetry/sources/dragy/constants';

// UBX-NAV-PVT (u-blox M10 SPG 5.10 §3.15.11), raw units.
export type DragyNavPvt = {
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
  groundSpeed: number;
  headingOfMotion: number;
  speedAccuracy: number;
  headingAccuracy: number;
  pdop: number;
  flags3: number;
};

export function decodeNavPvt(payload: Uint8Array): DragyNavPvt | null {
  if (payload.length !== NAV_PVT_PAYLOAD_LENGTH) {
    return null;
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    iTOW: view.getUint32(0, true),
    year: view.getUint16(4, true),
    month: view.getUint8(6),
    day: view.getUint8(7),
    hour: view.getUint8(8),
    minute: view.getUint8(9),
    second: view.getUint8(10),
    validityFlags: view.getUint8(11),
    timeAccuracyNs: view.getUint32(12, true),
    nanosecond: view.getInt32(16, true),
    fixType: view.getUint8(20),
    fixFlags: view.getUint8(21),
    flags2: view.getUint8(22),
    numSV: view.getUint8(23),
    longitude: view.getInt32(24, true),
    latitude: view.getInt32(28, true),
    wgsAltitude: view.getInt32(32, true),
    mslAltitude: view.getInt32(36, true),
    horizontalAccuracy: view.getUint32(40, true),
    verticalAccuracy: view.getUint32(44, true),
    groundSpeed: view.getInt32(60, true),
    headingOfMotion: view.getInt32(64, true),
    speedAccuracy: view.getUint32(68, true),
    headingAccuracy: view.getUint32(72, true),
    pdop: view.getUint16(76, true),
    flags3: view.getUint16(78, true),
  };
}

function hasValidFix(raw: DragyNavPvt): boolean {
  return raw.fixType === 3 && (raw.fixFlags & 0x01) === 1;
}

// flags3 bit 0: invalidLlh.
function hasInvalidCoords(raw: DragyNavPvt): boolean {
  return (raw.flags3 & 0x01) === 1;
}

export function navPvtToSample(
  raw: DragyNavPvt,
  resolveElapsedMs: TelemetryElapsedMsResolver,
  batteryLevel: number | null
): ExtendedTelemetrySample | null {
  if (!hasValidFix(raw) || hasInvalidCoords(raw)) {
    return null;
  }

  const recordedAt = utcFieldsToRecordedAt(raw);

  return {
    recordedAt,
    elapsedMs: resolveElapsedMs(recordedAt),
    lat: raw.latitude / 1e7,
    lng: raw.longitude / 1e7,
    speedMps: raw.groundSpeed / 1000,
    accuracyM: raw.horizontalAccuracy / 1000,
    headingDeg: normalizeHeading(raw.headingOfMotion),
    altitudeM: raw.mslAltitude / 1000,
    source: 'dragy',
    iTOW: raw.iTOW,
    timeAccuracyNs: raw.timeAccuracyNs,
    nanosecond: raw.nanosecond,
    verticalAccuracyM: raw.verticalAccuracy / 1000,
    speedAccuracyMps: raw.speedAccuracy / 1000,
    headingAccuracyDeg: raw.headingAccuracy / 1e5,
    pdop: raw.pdop / 100,
    satelliteCount: raw.numSV,
    fixType: raw.fixType,
    fixFlags: raw.fixFlags,
    validityFlags: raw.validityFlags,
    dateTimeFlags: raw.flags2,
    latLonFlags: raw.flags3 & 0xff,
    ...(batteryLevel === null ? {} : { batteryLevel }),
  };
}

export function isPerformanceModeReply(payload: Uint8Array): boolean {
  if (payload.length !== PERFORMANCE_MODE_REPLY_PAYLOAD.length) {
    return false;
  }
  for (let i = 0; i < payload.length; i++) {
    if (payload[i] !== PERFORMANCE_MODE_REPLY_PAYLOAD[i]) {
      return false;
    }
  }
  return true;
}

// A CFG-VALGET reply carrying CFG-RATE-MEAS: version, layer, position, key, U2 ms.
export function decodeMeasurementPeriodReply(payload: Uint8Array): number | null {
  if (payload.length < 10 || payload[0] !== VALGET_REPLY_VERSION) {
    return null;
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  if (view.getUint32(4, true) !== CFG_RATE_MEAS_KEY) {
    return null;
  }
  return view.getUint16(8, true);
}
