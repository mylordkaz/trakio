import type { SQLiteDatabase } from 'expo-sqlite';

// Raw Phase 2a IMU capture rows (see telemetry/imu-capture.ts). Read only by
// the session export; nothing in the app consumes them.

type DbImuSampleRow = {
  recorded_at: number;
  interval_ms: number | null;
  accel_x: number | null;
  accel_y: number | null;
  accel_z: number | null;
  accel_incl_gravity_x: number | null;
  accel_incl_gravity_y: number | null;
  accel_incl_gravity_z: number | null;
  rotation_alpha: number | null;
  rotation_beta: number | null;
  rotation_gamma: number | null;
  rotation_rate_alpha: number | null;
  rotation_rate_beta: number | null;
  rotation_rate_gamma: number | null;
};

export type ImuSampleExportRow = {
  recordedAt: number;
  intervalMs: number | null;
  accel: [number | null, number | null, number | null];
  accelInclGravity: [number | null, number | null, number | null];
  rotation: [number | null, number | null, number | null];
  rotationRate: [number | null, number | null, number | null];
};

// Sensor noise sits orders of magnitude above the 6th decimal; rounding keeps
// a 30-minute (~90k row) export from doubling in size on float digits.
function round6(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1e6) / 1e6;
}

export async function getImuSamplesForSession(
  db: SQLiteDatabase,
  sessionId: string
): Promise<ImuSampleExportRow[]> {
  const rows = await db.getAllAsync<DbImuSampleRow>(
    `SELECT *
     FROM imu_samples
     WHERE session_id = ?
     ORDER BY recorded_at ASC, rowid ASC;`,
    sessionId
  );

  return rows.map((row) => ({
    recordedAt: row.recorded_at,
    intervalMs: row.interval_ms,
    accel: [round6(row.accel_x), round6(row.accel_y), round6(row.accel_z)],
    accelInclGravity: [
      round6(row.accel_incl_gravity_x),
      round6(row.accel_incl_gravity_y),
      round6(row.accel_incl_gravity_z),
    ],
    rotation: [round6(row.rotation_alpha), round6(row.rotation_beta), round6(row.rotation_gamma)],
    rotationRate: [
      round6(row.rotation_rate_alpha),
      round6(row.rotation_rate_beta),
      round6(row.rotation_rate_gamma),
    ],
  }));
}
