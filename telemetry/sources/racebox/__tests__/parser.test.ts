import { decodeDataPayload, rawDataToSample } from '@/telemetry/sources/racebox/parser';
import { GOLDEN_DATA_PACKET_HEX, hexToBytes } from './helpers';

const packet = hexToBytes(GOLDEN_DATA_PACKET_HEX);
const payload = packet.slice(6, 86);

describe('decodeDataPayload', () => {
  it('decodes every field of the reference payload', () => {
    const raw = decodeDataPayload(payload);
    expect(raw).not.toBeNull();
    expect(raw!.iTOW).toBe(118286240);
    expect(raw!.year).toBe(2022);
    expect(raw!.month).toBe(1);
    expect(raw!.day).toBe(10);
    expect(raw!.hour).toBe(8);
    expect(raw!.minute).toBe(51);
    expect(raw!.second).toBe(8);
    expect(raw!.fixType).toBe(3);
    expect(raw!.numSV).toBe(11);
    expect(raw!.longitude).toBe(232887238);
    expect(raw!.latitude).toBe(426719035);
    expect(raw!.mslAltitude).toBe(590095);
    expect(raw!.horizontalAccuracy).toBe(924);
    expect(raw!.speed).toBe(35);
    expect(raw!.pdop).toBe(300);
    expect(raw!.batteryOrVoltage).toBe(0x59);
    expect(raw!.gForceX).toBe(-3);
    expect(raw!.gForceZ).toBe(974);
    expect(raw!.rotationRateX).toBe(-209);
    expect(raw!.rotationRateZ).toBe(-4);
  });

  it('rejects a payload of the wrong length', () => {
    expect(decodeDataPayload(payload.slice(0, 79))).toBeNull();
  });
});

describe('rawDataToSample', () => {
  it('maps a valid Mini fix to a telemetry sample', () => {
    const raw = decodeDataPayload(payload)!;
    const sample = rawDataToSample(raw, () => 1234, 'mini');

    expect(sample).not.toBeNull();
    expect(sample!.source).toBe('racebox');
    expect(sample!.elapsedMs).toBe(1234);
    expect(sample!.lat).toBeCloseTo(42.6719035, 7);
    expect(sample!.lng).toBeCloseTo(23.2887238, 7);
    expect(sample!.speedMps).toBeCloseTo(0.035, 6);
    expect(sample!.altitudeM).toBeCloseTo(590.095, 3);
    expect(sample!.accuracyM).toBeCloseTo(0.924, 3);
    expect(sample!.headingDeg).toBe(0);
    expect(sample!.gForceX).toBeCloseTo(-0.003, 4);
    expect(sample!.gForceZ).toBeCloseTo(0.974, 3);
    expect(sample!.rotationRateX).toBeCloseTo(-2.09, 2);
    expect(sample!.pdop).toBeCloseTo(3, 5);
    expect(sample!.satelliteCount).toBe(11);
    expect(sample!.batteryLevel).toBe(89);
    expect(sample!.isCharging).toBe(false);
    expect(sample!.inputVoltageV).toBeUndefined();
  });

  it('reports battery as input voltage for the Micro', () => {
    const raw = decodeDataPayload(payload)!;
    const sample = rawDataToSample(raw, () => 0, 'micro');

    expect(sample!.inputVoltageV).toBeCloseTo(8.9, 5);
    expect(sample!.batteryLevel).toBeUndefined();
    expect(sample!.isCharging).toBeUndefined();
  });

  it('rejects a reading without a 3D fix', () => {
    const raw = decodeDataPayload(payload)!;
    expect(rawDataToSample({ ...raw, fixType: 0 }, () => 0, 'mini')).toBeNull();
  });

  it('rejects a reading flagged with invalid coordinates', () => {
    const raw = decodeDataPayload(payload)!;
    expect(rawDataToSample({ ...raw, latLonFlags: 0x01 }, () => 0, 'mini')).toBeNull();
  });
});
