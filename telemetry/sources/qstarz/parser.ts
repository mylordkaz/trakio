import type { ExtendedTelemetrySample, TelemetryElapsedMsResolver } from '@/telemetry/types';
import {
  GNSS_RECORD_LENGTH,
  FIX_STATUS_3D,
  MAX_FIX_QUALITY,
  USABLE_FIX_QUALITY_MIN,
  USABLE_FIX_QUALITY_MAX,
  EARLIEST_VALID_FIX_UNIX_SECONDS,
  LATEST_VALID_FIX_UNIX_SECONDS,
} from '@/telemetry/sources/qstarz/constants';

export type QstarzRawRecord = {
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
  // Doc says "HDOP"/"VDOP" but Qstarz confirmed these are meters, used directly.
  horizontalAccuracyM: number;
  verticalAccuracyM: number;
  satellitesInView: number;
  satellitesUsed: number;
  fixQuality: number;
};

// NMEA-style DDDMM.MMMM in a double; Math.trunc keeps S/W hemispheres sign-correct.
function ddmmToDegrees(value: number): number {
  const wholeDegrees = Math.trunc(value / 100);
  return wholeDegrees + (value - wholeDegrees * 100) / 60;
}

// Minutes >= 60 is a misframed double, not a coordinate.
function isValidDdmm(value: number, maxDdmm: number): boolean {
  return (
    Number.isFinite(value) &&
    Math.abs(value) <= maxDdmm &&
    Math.abs(value) % 100 < 60
  );
}

// No checksum in the protocol; these bounds are the only misframe defense.
function isPlausibleRecord(record: QstarzRawRecord): boolean {
  return (
    record.fixStatus >= 1 &&
    record.fixStatus <= 3 &&
    record.milliseconds <= 999 &&
    isValidDdmm(record.latDdmm, 9000) &&
    isValidDdmm(record.lonDdmm, 18000) &&
    Number.isFinite(record.speedKmh) &&
    Number.isFinite(record.heightM) &&
    Number.isFinite(record.headingDeg) &&
    Number.isFinite(record.horizontalAccuracyM) &&
    record.horizontalAccuracyM >= 0 &&
    Number.isFinite(record.verticalAccuracyM) &&
    record.verticalAccuracyM >= 0 &&
    record.fixQuality <= MAX_FIX_QUALITY
  );
}

export function decodeGnssRecord(record: Uint8Array): QstarzRawRecord | null {
  if (record.length !== GNSS_RECORD_LENGTH) {
    return null;
  }

  const view = new DataView(record.buffer, record.byteOffset, record.byteLength);

  const raw: QstarzRawRecord = {
    fixStatus: view.getUint8(0),
    milliseconds: view.getUint16(2, true),
    latDdmm: view.getFloat64(4, true),
    lonDdmm: view.getFloat64(12, true),
    unixSeconds: view.getUint32(20, true),
    speedKmh: view.getFloat32(24, true),
    heightM: view.getFloat32(28, true),
    headingDeg: view.getFloat32(32, true),
    gForceX: view.getInt16(36, true),
    gForceY: view.getInt16(38, true),
    gForceZ: view.getInt16(40, true),
    maxSnr: view.getUint16(42, true),
    horizontalAccuracyM: view.getFloat32(44, true),
    verticalAccuracyM: view.getFloat32(48, true),
    satellitesInView: view.getUint8(52),
    satellitesUsed: view.getUint8(53),
    fixQuality: view.getUint8(54),
  };

  return isPlausibleRecord(raw) ? raw : null;
}

function hasUsableFix(raw: QstarzRawRecord): boolean {
  return (
    raw.fixStatus === FIX_STATUS_3D &&
    raw.fixQuality >= USABLE_FIX_QUALITY_MIN &&
    raw.fixQuality <= USABLE_FIX_QUALITY_MAX &&
    raw.unixSeconds >= EARLIEST_VALID_FIX_UNIX_SECONDS &&
    raw.unixSeconds < LATEST_VALID_FIX_UNIX_SECONDS &&
    raw.speedKmh >= 0
  );
}

function normalizeHeading(deg: number): number | null {
  if (deg < 0 || deg >= 360) {
    return null;
  }
  return deg;
}

export function rawRecordToSample(
  raw: QstarzRawRecord,
  resolveElapsedMs: TelemetryElapsedMsResolver,
  batteryLevel?: number
): ExtendedTelemetrySample | null {
  if (!hasUsableFix(raw)) {
    return null;
  }

  const recordedAt = raw.unixSeconds * 1000 + raw.milliseconds;

  return {
    recordedAt,
    elapsedMs: resolveElapsedMs(recordedAt),
    lat: ddmmToDegrees(raw.latDdmm),
    lng: ddmmToDegrees(raw.lonDdmm),
    speedMps: raw.speedKmh / 3.6,
    accuracyM: raw.horizontalAccuracyM,
    headingDeg: normalizeHeading(raw.headingDeg),
    altitudeM: raw.heightM,
    source: 'qstarz',
    gForceX: raw.gForceX / 256,
    gForceY: raw.gForceY / 256,
    gForceZ: raw.gForceZ / 256,
    verticalAccuracyM: raw.verticalAccuracyM,
    satelliteCount: raw.satellitesUsed,
    fixType: raw.fixStatus,
    batteryLevel,
  };
}
