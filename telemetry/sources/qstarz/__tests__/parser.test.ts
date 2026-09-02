import { decodeGnssRecord, rawRecordToSample } from '@/telemetry/sources/qstarz/parser';
import {
  GOLDEN_FIXED_FRAGMENTS_HEX,
  UNFIXED_818GT_FRAGMENTS_HEX,
  hexToBytes,
  buildGnssRecord,
} from './helpers';

const goldenRecord = hexToBytes(GOLDEN_FIXED_FRAGMENTS_HEX.join(''));
const unfixedRecord = hexToBytes(UNFIXED_818GT_FRAGMENTS_HEX.join(''));

describe('decodeGnssRecord', () => {
  it('decodes every field of the vendor reference record', () => {
    const raw = decodeGnssRecord(goldenRecord);

    expect(raw).not.toBeNull();
    expect(raw!.fixStatus).toBe(3);
    expect(raw!.milliseconds).toBe(700);
    expect(raw!.latDdmm).toBeCloseTo(2504.147156, 6);
    expect(raw!.lonDdmm).toBeCloseTo(12135.430946, 6);
    expect(raw!.unixSeconds).toBe(1533888606);
    expect(raw!.speedKmh).toBeCloseTo(0.70376, 5);
    expect(raw!.heightM).toBeCloseTo(155.654, 3);
    expect(raw!.headingDeg).toBeCloseTo(170.78, 4);
    expect(raw!.gForceX).toBe(53);
    expect(raw!.gForceY).toBe(7);
    expect(raw!.gForceZ).toBe(-248);
    expect(raw!.maxSnr).toBe(15);
    expect(raw!.hdop).toBe(2.25);
    expect(raw!.vdop).toBeCloseTo(1.28, 6);
    expect(raw!.satellitesInView).toBe(21);
    expect(raw!.satellitesUsed).toBe(4);
    expect(raw!.fixQuality).toBe(1);
    expect(raw!.batteryPercent).toBe(100);
  });

  it('decodes an unfixed vendor record structurally', () => {
    const raw = decodeGnssRecord(unfixedRecord);

    expect(raw).not.toBeNull();
    expect(raw!.fixStatus).toBe(1);
    expect(raw!.latDdmm).toBe(-0);
    expect(raw!.lonDdmm).toBe(-0);
    expect(raw!.fixQuality).toBe(0);
    expect(raw!.satellitesUsed).toBe(0);
    expect(raw!.gForceZ).toBe(261);
  });

  it('rejects records of the wrong length', () => {
    expect(decodeGnssRecord(goldenRecord.slice(0, 57))).toBeNull();
    expect(decodeGnssRecord(new Uint8Array(59))).toBeNull();
  });

  it('rejects fix status values outside the protocol range', () => {
    expect(decodeGnssRecord(buildGnssRecord({ fixStatus: 0 }))).toBeNull();
    expect(decodeGnssRecord(buildGnssRecord({ fixStatus: 4 }))).toBeNull();
  });

  it('rejects a millisecond field beyond one second', () => {
    expect(decodeGnssRecord(buildGnssRecord({ milliseconds: 1000 }))).toBeNull();
    expect(decodeGnssRecord(buildGnssRecord({ milliseconds: 999 }))).not.toBeNull();
  });

  it('rejects coordinates outside DDDMM bounds', () => {
    expect(decodeGnssRecord(buildGnssRecord({ latDdmm: 9000.1 }))).toBeNull();
    expect(decodeGnssRecord(buildGnssRecord({ lonDdmm: -18000.1 }))).toBeNull();
    expect(decodeGnssRecord(buildGnssRecord({ latDdmm: 9000 }))).not.toBeNull();
  });

  it('rejects non-finite measurement fields', () => {
    expect(decodeGnssRecord(buildGnssRecord({ speedKmh: NaN }))).toBeNull();
    expect(decodeGnssRecord(buildGnssRecord({ heightM: Infinity }))).toBeNull();
    expect(decodeGnssRecord(buildGnssRecord({ hdop: NaN }))).toBeNull();
  });

  it('rejects DDDMM values whose minutes reach 60', () => {
    expect(decodeGnssRecord(buildGnssRecord({ latDdmm: 8960.0 }))).toBeNull();
    expect(decodeGnssRecord(buildGnssRecord({ lonDdmm: 12360.5 }))).toBeNull();
    expect(decodeGnssRecord(buildGnssRecord({ latDdmm: 8959.99 }))).not.toBeNull();
  });

  it('rejects negative DOP values', () => {
    expect(decodeGnssRecord(buildGnssRecord({ hdop: -0.1 }))).toBeNull();
    expect(decodeGnssRecord(buildGnssRecord({ vdop: -1 }))).toBeNull();
  });

  it('rejects fix quality values outside the protocol enum', () => {
    expect(decodeGnssRecord(buildGnssRecord({ fixQuality: 9 }))).toBeNull();
    expect(decodeGnssRecord(buildGnssRecord({ fixQuality: 255 }))).toBeNull();
    expect(decodeGnssRecord(buildGnssRecord({ fixQuality: 8 }))).not.toBeNull();
  });
});

describe('rawRecordToSample', () => {
  it('maps the vendor reference record to a telemetry sample', () => {
    const raw = decodeGnssRecord(goldenRecord)!;
    const sample = rawRecordToSample(raw, (t) => t - 1533888600000);

    expect(sample).not.toBeNull();
    expect(sample!.source).toBe('qstarz');
    expect(sample!.recordedAt).toBe(1533888606700);
    expect(sample!.elapsedMs).toBe(6700);
    expect(sample!.lat).toBeCloseTo(25.0691193, 6);
    expect(sample!.lng).toBeCloseTo(121.5905158, 6);
    expect(sample!.speedMps).toBeCloseTo(0.1954889, 6);
    expect(sample!.accuracyM).toBe(6.75);
    expect(sample!.headingDeg).toBeCloseTo(170.78, 4);
    expect(sample!.altitudeM).toBeCloseTo(155.654, 3);
    expect(sample!.gForceX).toBeCloseTo(0.20703125, 8);
    expect(sample!.gForceY).toBeCloseTo(0.02734375, 8);
    expect(sample!.gForceZ).toBeCloseTo(-0.96875, 8);
    expect(sample!.pdop).toBeCloseTo(2.5886097, 6);
    expect(sample!.satelliteCount).toBe(4);
    expect(sample!.fixType).toBe(3);
    expect(sample!.batteryLevel).toBe(100);
    expect(sample!.rotationRateX).toBeUndefined();
    expect(sample!.speedAccuracyMps).toBeUndefined();
    expect(sample!.verticalAccuracyM).toBeUndefined();
  });

  it('reads battery from the record and drops out-of-range values', () => {
    const low = decodeGnssRecord(buildGnssRecord({ batteryPercent: 60 }))!;
    expect(rawRecordToSample(low, () => 0)!.batteryLevel).toBe(60);

    const invalid = decodeGnssRecord(buildGnssRecord({ batteryPercent: 255 }))!;
    expect(rawRecordToSample(invalid, () => 0)!.batteryLevel).toBeUndefined();
  });

  it('converts southern and western hemisphere coordinates', () => {
    const record = buildGnssRecord({ latDdmm: -2530.5, lonDdmm: -4738.25 });
    const sample = rawRecordToSample(decodeGnssRecord(record)!, () => 0);

    expect(sample!.lat).toBeCloseTo(-25.5083333, 6);
    expect(sample!.lng).toBeCloseTo(-47.6375, 6);
  });

  it('derives accuracy from HDOP', () => {
    const record = buildGnssRecord({ hdop: 1.5 });
    const sample = rawRecordToSample(decodeGnssRecord(record)!, () => 0);

    expect(sample!.accuracyM).toBeCloseTo(4.5, 6);
  });

  it('rejects the unfixed vendor record', () => {
    const raw = decodeGnssRecord(unfixedRecord)!;
    expect(rawRecordToSample(raw, () => 0)).toBeNull();
  });

  it('rejects 2D fixes', () => {
    const raw = decodeGnssRecord(buildGnssRecord({ fixStatus: 2 }))!;
    expect(rawRecordToSample(raw, () => 0)).toBeNull();
  });

  it('rejects a 3D fix whose quality byte reads invalid', () => {
    const raw = decodeGnssRecord(buildGnssRecord({ fixQuality: 0 }))!;
    expect(rawRecordToSample(raw, () => 0)).toBeNull();
  });

  it('rejects dead-reckoning, manual, and simulation fix qualities', () => {
    for (const fixQuality of [6, 7, 8]) {
      const raw = decodeGnssRecord(buildGnssRecord({ fixQuality }))!;
      expect(rawRecordToSample(raw, () => 0)).toBeNull();
    }

    const floatRtk = decodeGnssRecord(buildGnssRecord({ fixQuality: 5 }))!;
    expect(rawRecordToSample(floatRtk, () => 0)).not.toBeNull();
  });

  it('rejects a fix carrying an implausible timestamp', () => {
    const early = decodeGnssRecord(buildGnssRecord({ unixSeconds: 0 }))!;
    expect(rawRecordToSample(early, () => 0)).toBeNull();

    const late = decodeGnssRecord(buildGnssRecord({ unixSeconds: 4102444800 }))!;
    expect(rawRecordToSample(late, () => 0)).toBeNull();

    const boundary = decodeGnssRecord(buildGnssRecord({ unixSeconds: 1420070400 }))!;
    expect(rawRecordToSample(boundary, () => 0)).not.toBeNull();
  });

  it('rejects a negative reported speed', () => {
    const raw = decodeGnssRecord(buildGnssRecord({ speedKmh: -0.5 }))!;
    expect(rawRecordToSample(raw, () => 0)).toBeNull();
  });

  it('nulls the heading outside 0-360 without dropping the sample', () => {
    const wrapped = decodeGnssRecord(buildGnssRecord({ headingDeg: 360 }))!;
    const wrappedSample = rawRecordToSample(wrapped, () => 0);
    expect(wrappedSample).not.toBeNull();
    expect(wrappedSample!.headingDeg).toBeNull();

    const negative = decodeGnssRecord(buildGnssRecord({ headingDeg: -5 }))!;
    expect(rawRecordToSample(negative, () => 0)!.headingDeg).toBeNull();

    const valid = decodeGnssRecord(buildGnssRecord({ headingDeg: 359.9 }))!;
    expect(rawRecordToSample(valid, () => 0)!.headingDeg).toBeCloseTo(359.9, 3);
  });
});
