import type { SQLiteDatabase } from 'expo-sqlite';

// Quarantined fixes the validation filter rejected at capture (see
// capture-everything: db/session-recorder.ts recordRejectedSample). Never read
// by the app — export/offline analysis only.

type DbRejectedGpsPointRow = {
  recorded_at: string;
  elapsed_ms: number | null;
  latitude: number;
  longitude: number;
  speed_mps: number | null;
  accuracy_m: number | null;
  altitude_m: number | null;
  heading_deg: number | null;
  rejection_reason: string;
};

export type RejectedGpsPointExportRow = {
  recordedAt: string;
  elapsedMs: number | null;
  latitude: number;
  longitude: number;
  speedMps: number | null;
  accuracyM: number | null;
  altitudeM: number | null;
  headingDeg: number | null;
  rejectionReason: string;
};

export async function getRejectedGpsPointsForSession(
  db: SQLiteDatabase,
  sessionId: string
): Promise<RejectedGpsPointExportRow[]> {
  const rows = await db.getAllAsync<DbRejectedGpsPointRow>(
    `SELECT *
     FROM rejected_gps_points
     WHERE session_id = ?
     ORDER BY recorded_at ASC, rowid ASC;`,
    sessionId
  );

  return rows.map((row) => ({
    recordedAt: row.recorded_at,
    elapsedMs: row.elapsed_ms,
    latitude: row.latitude,
    longitude: row.longitude,
    speedMps: row.speed_mps,
    accuracyM: row.accuracy_m,
    altitudeM: row.altitude_m,
    headingDeg: row.heading_deg,
    rejectionReason: row.rejection_reason,
  }));
}
