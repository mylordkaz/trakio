import { DeviceMotion, type DeviceMotionMeasurement } from 'expo-sensors';
import type { SQLiteDatabase } from 'expo-sqlite';

// Phase 2a raw IMU capture (docs/kalman/phase-2-imu-fusion.md §2a, phone
// path). Records DeviceMotion samples ~50 Hz into imu_samples, exactly as
// delivered by the OS — no processing, no consumers in the app. The data
// exists solely so the offline bench can develop and validate IMU fusion
// against real driving. Capture must never affect recording: every failure
// path degrades to "no IMU data", not to a recording error.

const UPDATE_INTERVAL_MS = 20; // ~50 Hz
const FLUSH_ROW_COUNT = 100; // one batched insert every ~2 s

export type ImuSampleRow = {
  recordedAt: number;
  intervalMs: number | null;
  accelX: number | null;
  accelY: number | null;
  accelZ: number | null;
  accelInclGravityX: number | null;
  accelInclGravityY: number | null;
  accelInclGravityZ: number | null;
  rotationAlpha: number | null;
  rotationBeta: number | null;
  rotationGamma: number | null;
  rotationRateAlpha: number | null;
  rotationRateBeta: number | null;
  rotationRateGamma: number | null;
};

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// Exported for tests. Values are stored exactly as delivered by expo-sensors
// (acceleration in m/s² device frame with gravity separated, rotation in
// radians, rotationRate as reported by the platform).
export function toImuSampleRow(
  measurement: DeviceMotionMeasurement,
  recordedAt: number
): ImuSampleRow {
  return {
    recordedAt,
    intervalMs: numberOrNull(measurement.interval),
    accelX: numberOrNull(measurement.acceleration?.x),
    accelY: numberOrNull(measurement.acceleration?.y),
    accelZ: numberOrNull(measurement.acceleration?.z),
    accelInclGravityX: numberOrNull(measurement.accelerationIncludingGravity?.x),
    accelInclGravityY: numberOrNull(measurement.accelerationIncludingGravity?.y),
    accelInclGravityZ: numberOrNull(measurement.accelerationIncludingGravity?.z),
    rotationAlpha: numberOrNull(measurement.rotation?.alpha),
    rotationBeta: numberOrNull(measurement.rotation?.beta),
    rotationGamma: numberOrNull(measurement.rotation?.gamma),
    rotationRateAlpha: numberOrNull(measurement.rotationRate?.alpha),
    rotationRateBeta: numberOrNull(measurement.rotationRate?.beta),
    rotationRateGamma: numberOrNull(measurement.rotationRate?.gamma),
  };
}

const ROW_COLUMNS = 14;
const INSERT_PREFIX = `INSERT INTO imu_samples (
  session_id, recorded_at, interval_ms,
  accel_x, accel_y, accel_z,
  accel_incl_gravity_x, accel_incl_gravity_y, accel_incl_gravity_z,
  rotation_alpha, rotation_beta, rotation_gamma,
  rotation_rate_alpha, rotation_rate_beta, rotation_rate_gamma
) VALUES `;

function rowParams(sessionId: string, row: ImuSampleRow): (string | number | null)[] {
  return [
    sessionId,
    row.recordedAt,
    row.intervalMs,
    row.accelX,
    row.accelY,
    row.accelZ,
    row.accelInclGravityX,
    row.accelInclGravityY,
    row.accelInclGravityZ,
    row.rotationAlpha,
    row.rotationBeta,
    row.rotationGamma,
    row.rotationRateAlpha,
    row.rotationRateBeta,
    row.rotationRateGamma,
  ];
}

export function createImuCapture(db: SQLiteDatabase, sessionId: string) {
  let subscription: { remove: () => void } | null = null;
  let buffer: ImuSampleRow[] = [];
  let flushing = Promise.resolve();
  let stopped = false;

  async function flush(): Promise<void> {
    if (buffer.length === 0) {
      return;
    }

    const rows = buffer;
    buffer = [];

    const placeholders = rows
      .map(() => `(${new Array(ROW_COLUMNS + 1).fill('?').join(', ')})`)
      .join(', ');
    const params = rows.flatMap((row) => rowParams(sessionId, row));

    try {
      await db.runAsync(INSERT_PREFIX + placeholders + ';', ...params);
    } catch {
      // Losing IMU rows is acceptable; interfering with recording is not.
    }
  }

  function enqueueFlush() {
    flushing = flushing.then(flush);
  }

  async function start(): Promise<boolean> {
    try {
      const available = await DeviceMotion.isAvailableAsync();
      if (!available) {
        return false;
      }

      const permission = await DeviceMotion.requestPermissionsAsync();
      if (!permission.granted) {
        return false;
      }

      DeviceMotion.setUpdateInterval(UPDATE_INTERVAL_MS);
      subscription = DeviceMotion.addListener((measurement) => {
        if (stopped) {
          return;
        }

        buffer.push(toImuSampleRow(measurement, Date.now()));
        if (buffer.length >= FLUSH_ROW_COUNT) {
          enqueueFlush();
        }
      });

      return true;
    } catch {
      return false;
    }
  }

  async function stop(): Promise<void> {
    stopped = true;
    subscription?.remove();
    subscription = null;
    enqueueFlush();
    await flushing;
  }

  return { start, stop };
}
