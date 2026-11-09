import {
  decodeNavPvt,
  navPvtToSample,
  isPerformanceModeReply,
  decodeMeasurementPeriodReply,
} from '@/telemetry/sources/dragy/parser';
import { PERFORMANCE_MODE_REPLY_PAYLOAD } from '@/telemetry/sources/dragy/constants';
import {
  buildNavPvtPayload,
  hexToBytes,
  DOC_PERFORMANCE_MODE_REPLY_HEX,
  DOC_RATE_REPLY_10HZ_HEX,
  DOC_RATE_REPLY_20HZ_HEX,
  DOC_RATE_REPLY_25HZ_HEX,
} from './helpers';

// Reply frames carry 6 header bytes and a 2-byte checksum around the payload.
const payloadOf = (frameHex: string) => {
  const frame = hexToBytes(frameHex);
  return frame.slice(6, frame.length - 2);
};

describe('decodeNavPvt', () => {
  it('decodes every field at the M10 NAV-PVT offsets', () => {
    const raw = decodeNavPvt(buildNavPvtPayload());
    expect(raw).not.toBeNull();
    expect(raw!.iTOW).toBe(12345678);
    expect(raw!.year).toBe(2026);
    expect(raw!.month).toBe(7);
    expect(raw!.day).toBe(26);
    expect(raw!.hour).toBe(3);
    expect(raw!.minute).toBe(20);
    expect(raw!.second).toBe(0);
    expect(raw!.validityFlags).toBe(0x07);
    expect(raw!.timeAccuracyNs).toBe(50);
    expect(raw!.nanosecond).toBe(400_000_000);
    expect(raw!.fixType).toBe(3);
    expect(raw!.fixFlags).toBe(0x01);
    expect(raw!.flags2).toBe(0xe0);
    expect(raw!.numSV).toBe(14);
    expect(raw!.longitude).toBe(1400917000);
    expect(raw!.latitude).toBe(361513000);
    expect(raw!.wgsAltitude).toBe(60000);
    expect(raw!.mslAltitude).toBe(28400);
    expect(raw!.horizontalAccuracy).toBe(924);
    expect(raw!.verticalAccuracy).toBe(1500);
    expect(raw!.groundSpeed).toBe(36806);
    expect(raw!.headingOfMotion).toBe(21470000);
    expect(raw!.speedAccuracy).toBe(250);
    expect(raw!.headingAccuracy).toBe(150000);
    expect(raw!.pdop).toBe(180);
    expect(raw!.flags3).toBe(0);
  });

  it('rejects a payload of the wrong length', () => {
    expect(decodeNavPvt(buildNavPvtPayload().slice(0, 91))).toBeNull();
    expect(decodeNavPvt(new Uint8Array(100))).toBeNull();
  });
});

describe('navPvtToSample', () => {
  const raw = decodeNavPvt(buildNavPvtPayload())!;

  it('maps a 3D fix to a telemetry sample in physical units', () => {
    const sample = navPvtToSample(raw, () => 4321, 84);

    expect(sample).not.toBeNull();
    expect(sample!.source).toBe('dragy');
    expect(sample!.elapsedMs).toBe(4321);
    expect(sample!.recordedAt).toBe(Date.UTC(2026, 6, 26, 3, 20, 0) + 400);
    expect(sample!.lat).toBeCloseTo(36.1513, 7);
    expect(sample!.lng).toBeCloseTo(140.0917, 7);
    expect(sample!.speedMps).toBeCloseTo(36.806, 6);
    expect(sample!.accuracyM).toBeCloseTo(0.924, 6);
    expect(sample!.headingDeg).toBeCloseTo(214.7, 5);
    expect(sample!.altitudeM).toBeCloseTo(28.4, 6);
    expect(sample!.iTOW).toBe(12345678);
    expect(sample!.timeAccuracyNs).toBe(50);
    expect(sample!.nanosecond).toBe(400_000_000);
    expect(sample!.verticalAccuracyM).toBeCloseTo(1.5, 6);
    expect(sample!.speedAccuracyMps).toBeCloseTo(0.25, 6);
    expect(sample!.headingAccuracyDeg).toBeCloseTo(1.5, 6);
    expect(sample!.pdop).toBeCloseTo(1.8, 6);
    expect(sample!.satelliteCount).toBe(14);
    expect(sample!.fixType).toBe(3);
    expect(sample!.fixFlags).toBe(0x01);
    expect(sample!.validityFlags).toBe(0x07);
    expect(sample!.dateTimeFlags).toBe(0xe0);
    expect(sample!.latLonFlags).toBe(0);
    expect(sample!.batteryLevel).toBe(84);
    expect(sample!.gForceX).toBeUndefined();
    expect(sample!.rotationRateZ).toBeUndefined();
    expect(sample!.inputVoltageV).toBeUndefined();
  });

  it('leaves battery out until it has been read', () => {
    const sample = navPvtToSample(raw, () => 0, null)!;
    expect('batteryLevel' in sample).toBe(false);
  });

  it('falls back to the phone clock when UTC is not fully resolved', () => {
    const before = Date.now();
    const sample = navPvtToSample({ ...raw, validityFlags: 0x03 }, () => 0, null)!;
    expect(sample.recordedAt).toBeGreaterThanOrEqual(before);
    expect(sample.recordedAt).toBeLessThanOrEqual(Date.now());
  });

  it('nulls a heading outside [0, 360)', () => {
    expect(navPvtToSample({ ...raw, headingOfMotion: 36000000 }, () => 0, null)!.headingDeg).toBeNull();
    expect(navPvtToSample({ ...raw, headingOfMotion: -1 }, () => 0, null)!.headingDeg).toBeNull();
  });

  it('rejects anything short of a confirmed 3D fix', () => {
    expect(navPvtToSample({ ...raw, fixType: 2 }, () => 0, null)).toBeNull();
    expect(navPvtToSample({ ...raw, fixType: 0 }, () => 0, null)).toBeNull();
    expect(navPvtToSample({ ...raw, fixFlags: 0x00 }, () => 0, null)).toBeNull();
  });

  it('rejects a fix flagged invalidLlh', () => {
    expect(navPvtToSample({ ...raw, flags3: 0x0001 }, () => 0, null)).toBeNull();
  });
});

describe('isPerformanceModeReply', () => {
  it('matches the documented reply payload', () => {
    expect(isPerformanceModeReply(payloadOf(DOC_PERFORMANCE_MODE_REPLY_HEX))).toBe(true);
    expect(isPerformanceModeReply(PERFORMANCE_MODE_REPLY_PAYLOAD)).toBe(true);
  });

  it('rejects a different value or length', () => {
    const altered = PERFORMANCE_MODE_REPLY_PAYLOAD.slice();
    altered[9] ^= 0x01;
    expect(isPerformanceModeReply(altered)).toBe(false);
    expect(isPerformanceModeReply(PERFORMANCE_MODE_REPLY_PAYLOAD.slice(0, 35))).toBe(false);
  });
});

describe('decodeMeasurementPeriodReply', () => {
  it('decodes each documented rate reply', () => {
    expect(decodeMeasurementPeriodReply(payloadOf(DOC_RATE_REPLY_10HZ_HEX))).toBe(100);
    expect(decodeMeasurementPeriodReply(payloadOf(DOC_RATE_REPLY_20HZ_HEX))).toBe(50);
    expect(decodeMeasurementPeriodReply(payloadOf(DOC_RATE_REPLY_25HZ_HEX))).toBe(40);
  });

  it('rejects replies for other keys, other versions, or too short', () => {
    expect(decodeMeasurementPeriodReply(payloadOf(DOC_PERFORMANCE_MODE_REPLY_HEX))).toBeNull();
    const wrongVersion = payloadOf(DOC_RATE_REPLY_25HZ_HEX);
    wrongVersion[0] = 0x00;
    expect(decodeMeasurementPeriodReply(wrongVersion)).toBeNull();
    expect(decodeMeasurementPeriodReply(Uint8Array.from([0x06, 0x8a]))).toBeNull();
  });
});
