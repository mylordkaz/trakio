import type { SQLiteDatabase } from 'expo-sqlite';

// Raw Phase 2a IMU capture rows (see telemetry/imu-capture.ts). Read by the
// session export and, heading-related columns only, by the display's hole
// bridge.

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

export type ImuHeadingSample = {
  recordedAt: number;
  yawRad: number;
  // As delivered: [alpha, beta, gamma] in deg/s.
  rotationRate: [number, number, number];
  // accelerationIncludingGravity − acceleration, device axes, m/s².
  gravity: [number, number, number];
};

type DbImuHeadingRow = {
  recorded_at: number;
  rotation_alpha: number;
  rotation_rate_alpha: number;
  rotation_rate_beta: number;
  rotation_rate_gamma: number;
  gravity_x: number;
  gravity_y: number;
  gravity_z: number;
};

export async function getImuHeadingSamplesForSession(
  db: SQLiteDatabase,
  sessionId: string
): Promise<ImuHeadingSample[]> {
  const rows = await db.getAllAsync<DbImuHeadingRow>(
    `SELECT recorded_at, rotation_alpha,
            rotation_rate_alpha, rotation_rate_beta, rotation_rate_gamma,
            accel_incl_gravity_x - accel_x AS gravity_x,
            accel_incl_gravity_y - accel_y AS gravity_y,
            accel_incl_gravity_z - accel_z AS gravity_z
     FROM imu_samples
     WHERE session_id = ?
       AND rotation_alpha IS NOT NULL
       AND rotation_rate_alpha IS NOT NULL AND rotation_rate_beta IS NOT NULL AND rotation_rate_gamma IS NOT NULL
       AND accel_x IS NOT NULL AND accel_y IS NOT NULL AND accel_z IS NOT NULL
       AND accel_incl_gravity_x IS NOT NULL AND accel_incl_gravity_y IS NOT NULL AND accel_incl_gravity_z IS NOT NULL
     ORDER BY recorded_at ASC, rowid ASC;`,
    sessionId
  );

  return rows.map((row) => ({
    recordedAt: row.recorded_at,
    yawRad: row.rotation_alpha,
    rotationRate: [row.rotation_rate_alpha, row.rotation_rate_beta, row.rotation_rate_gamma],
    gravity: [row.gravity_x, row.gravity_y, row.gravity_z],
  }));
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
