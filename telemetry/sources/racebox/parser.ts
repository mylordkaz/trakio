import type { ExtendedTelemetrySample, TelemetryElapsedMsResolver } from '@/telemetry/types';
import { DATA_PAYLOAD_LENGTH } from '@/telemetry/sources/racebox/constants';

export type RaceBoxRawData = {
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
  dateTimeFlags: number;
  numSV: number;
  longitude: number;
  latitude: number;
  wgsAltitude: number;
  mslAltitude: number;
  horizontalAccuracy: number;
  verticalAccuracy: number;
  speed: number;
  heading: number;
  speedAccuracy: number;
  headingAccuracy: number;
  pdop: number;
  latLonFlags: number;
  batteryOrVoltage: number;
  gForceX: number;
  gForceY: number;
  gForceZ: number;
  rotationRateX: number;
  rotationRateY: number;
  rotationRateZ: number;
};

export function decodeDataPayload(payload: Uint8Array): RaceBoxRawData | null {
  if (payload.length !== DATA_PAYLOAD_LENGTH) {
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
    dateTimeFlags: view.getUint8(22),
    numSV: view.getUint8(23),
    longitude: view.getInt32(24, true),
    latitude: view.getInt32(28, true),
    wgsAltitude: view.getInt32(32, true),
    mslAltitude: view.getInt32(36, true),
    horizontalAccuracy: view.getUint32(40, true),
    verticalAccuracy: view.getUint32(44, true),
    speed: view.getInt32(48, true),
    heading: view.getInt32(52, true),
    speedAccuracy: view.getUint32(56, true),
    headingAccuracy: view.getUint32(60, true),
    pdop: view.getUint16(64, true),
    latLonFlags: view.getUint8(66),
    batteryOrVoltage: view.getUint8(67),
    gForceX: view.getInt16(68, true),
    gForceY: view.getInt16(70, true),
    gForceZ: view.getInt16(72, true),
    rotationRateX: view.getInt16(74, true),
    rotationRateY: view.getInt16(76, true),
    rotationRateZ: view.getInt16(78, true),
  };
}

function hasValidFix(raw: RaceBoxRawData): boolean {
  return raw.fixType === 3 && (raw.fixFlags & 0x01) === 1;
}

function hasInvalidCoords(raw: RaceBoxRawData): boolean {
  return (raw.latLonFlags & 0x01) === 1;
}

function buildRecordedAt(raw: RaceBoxRawData): number {
  if ((raw.validityFlags & 0x07) !== 0x07) {
    return Date.now();
  }

  const date = new Date(
    Date.UTC(raw.year, raw.month - 1, raw.day, raw.hour, raw.minute, raw.second)
  );
  const ms = date.getTime() + raw.nanosecond / 1_000_000;
  return Math.round(ms);
}

function normalizeHeading(raw: number): number | null {
  const deg = raw / 1e5;
  if (deg < 0 || deg >= 360) {
    return null;
  }
  return deg;
}

export function rawDataToSample(
  raw: RaceBoxRawData,
  resolveElapsedMs: TelemetryElapsedMsResolver,
  deviceModel: 'mini' | 'micro'
): ExtendedTelemetrySample | null {
  if (!hasValidFix(raw) || hasInvalidCoords(raw)) {
    return null;
  }

  const recordedAt = buildRecordedAt(raw);
  const batteryOrVoltage = raw.batteryOrVoltage;

  return {
    recordedAt,
    elapsedMs: resolveElapsedMs(recordedAt),
    lat: raw.latitude / 1e7,
    lng: raw.longitude / 1e7,
    speedMps: raw.speed / 1000,
    accuracyM: raw.horizontalAccuracy / 1000,
    headingDeg: normalizeHeading(raw.heading),
    altitudeM: raw.mslAltitude / 1000,
    source: 'racebox',
    iTOW: raw.iTOW,
    timeAccuracyNs: raw.timeAccuracyNs,
    nanosecond: raw.nanosecond,
    gForceX: raw.gForceX / 1000,
    gForceY: raw.gForceY / 1000,
    gForceZ: raw.gForceZ / 1000,
    rotationRateX: raw.rotationRateX / 100,
    rotationRateY: raw.rotationRateY / 100,
    rotationRateZ: raw.rotationRateZ / 100,
    verticalAccuracyM: raw.verticalAccuracy / 1000,
    speedAccuracyMps: raw.speedAccuracy / 1000,
    headingAccuracyDeg: raw.headingAccuracy / 1e5,
    pdop: raw.pdop / 100,
    satelliteCount: raw.numSV,
    fixType: raw.fixType,
    fixFlags: raw.fixFlags,
    validityFlags: raw.validityFlags,
    dateTimeFlags: raw.dateTimeFlags,
    latLonFlags: raw.latLonFlags,
    batteryLevel: deviceModel === 'mini' ? (batteryOrVoltage & 0x7f) : undefined,
    isCharging: deviceModel === 'mini' ? (batteryOrVoltage & 0x80) !== 0 : undefined,
    inputVoltageV: deviceModel === 'micro' ? batteryOrVoltage / 10 : undefined,
  };
}
