import { toImuSampleRow } from '@/telemetry/imu-capture';
import type { DeviceMotionMeasurement } from 'expo-sensors';

describe('toImuSampleRow', () => {
  it('maps a full measurement as delivered', () => {
    const measurement = {
      acceleration: { x: 0.12, y: -0.34, z: 9.1, timestamp: 0 },
      accelerationIncludingGravity: { x: 0.1, y: 9.7, z: 0.3, timestamp: 0 },
      rotation: { alpha: 1.1, beta: -0.2, gamma: 0.05, timestamp: 0 },
      rotationRate: { alpha: 12, beta: -3, gamma: 0.5, timestamp: 0 },
      interval: 20,
      orientation: 0,
    } as unknown as DeviceMotionMeasurement;

    const row = toImuSampleRow(measurement, 1_700_000_000_123);

    expect(row.recordedAt).toBe(1_700_000_000_123);
    expect(row.intervalMs).toBe(20);
    expect(row.accelX).toBe(0.12);
    expect(row.accelInclGravityY).toBe(9.7);
    expect(row.rotationAlpha).toBe(1.1);
    expect(row.rotationRateGamma).toBe(0.5);
  });

  it('maps missing and non-finite fields to null', () => {
    const measurement = {
      acceleration: null,
      accelerationIncludingGravity: { x: NaN, y: Infinity, z: 1 },
      rotation: undefined,
      rotationRate: { alpha: null, beta: 2, gamma: undefined },
      interval: undefined,
      orientation: 0,
    } as unknown as DeviceMotionMeasurement;

    const row = toImuSampleRow(measurement, 1);

    expect(row.accelX).toBeNull();
    expect(row.accelInclGravityX).toBeNull();
    expect(row.accelInclGravityY).toBeNull();
    expect(row.accelInclGravityZ).toBe(1);
    expect(row.rotationAlpha).toBeNull();
    expect(row.rotationRateAlpha).toBeNull();
    expect(row.rotationRateBeta).toBe(2);
    expect(row.rotationRateGamma).toBeNull();
    expect(row.intervalMs).toBeNull();
  });
});
