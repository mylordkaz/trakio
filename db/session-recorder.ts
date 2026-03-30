import type { SQLiteDatabase } from 'expo-sqlite';
import type { SessionStatus } from '@/db/types';
import type { TelemetrySample } from '@/telemetry/types';

type RecorderConfig = {
  flushPointCount?: number;
};

type CreateSessionInput = {
  id: string;
  userId?: string | null;
  trackId: string;
  startedAt: string;
  name?: string | null;
  status?: SessionStatus;
};

type StartLapInput = {
  id: string;
  sessionId: string;
  lapNumber: number;
  startedAt: string;
  isOutLap?: 0 | 1;
  isInvalid?: 0 | 1;
};

type FinishLapInput = {
  lapId: string;
  endedAt: string;
  lapTimeMs: number | null;
  isInvalid?: 0 | 1;
  maxSpeedKph?: number | null;
};

type InsertLapSectorInput = {
  id: string;
  lapId: string;
  sectorIndex: number;
  splitTimeMs: number;
};

type FinalizeSessionInput = {
  sessionId: string;
  endedAt: string;
  status?: Extract<SessionStatus, 'completed' | 'aborted'>;
  bestLapMs?: number | null;
  totalLaps?: number | null;
  maxSpeedKph?: number | null;
};

type BufferedGpsPoint = {
  id: string;
  sessionId: string;
  lapId: string | null;
  sample: TelemetrySample;
  isTimingCrossing: 0 | 1;
};

function toIsoString(timestampMs: number) {
  return new Date(timestampMs).toISOString();
}

export function createSessionRecorder(db: SQLiteDatabase, config: RecorderConfig = {}) {
  const flushPointCount = config.flushPointCount ?? 20;
  let gpsBuffer: BufferedGpsPoint[] = [];

  async function createSession(input: CreateSessionInput): Promise<void> {
    await db.runAsync(
      `INSERT INTO sessions (
        id,
        name,
        user_id,
        track_id,
        started_at,
        status
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        user_id = excluded.user_id,
        track_id = excluded.track_id,
        started_at = excluded.started_at,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP;`,
      input.id,
      input.name ?? null,
      input.userId ?? null,
      input.trackId,
      input.startedAt,
      input.status ?? 'recording'
    );
  }

  async function startLap(input: StartLapInput): Promise<void> {
    await db.runAsync(
      `INSERT INTO laps (
        id,
        session_id,
        lap_number,
        started_at,
        is_out_lap,
        is_invalid
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        session_id = excluded.session_id,
        lap_number = excluded.lap_number,
        started_at = excluded.started_at,
        is_out_lap = excluded.is_out_lap,
        is_invalid = excluded.is_invalid;`,
      input.id,
      input.sessionId,
      input.lapNumber,
      input.startedAt,
      input.isOutLap ?? 0,
      input.isInvalid ?? 0
    );
  }

  async function finishLap(input: FinishLapInput): Promise<void> {
    await db.runAsync(
      `UPDATE laps
       SET ended_at = ?,
           lap_time_ms = ?,
           is_invalid = ?,
           max_speed_kph = ?
       WHERE id = ?;`,
      input.endedAt,
      input.lapTimeMs,
      input.isInvalid ?? 0,
      input.maxSpeedKph ?? null,
      input.lapId
    );
  }

  async function insertLapSector(input: InsertLapSectorInput): Promise<void> {
    await db.runAsync(
      `INSERT INTO lap_sectors (
        id,
        lap_id,
        sector_index,
        split_time_ms
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        lap_id = excluded.lap_id,
        sector_index = excluded.sector_index,
        split_time_ms = excluded.split_time_ms;`,
      input.id,
      input.lapId,
      input.sectorIndex,
      input.splitTimeMs
    );
  }

  async function flushGpsBuffer(): Promise<void> {
    if (gpsBuffer.length === 0) {
      return;
    }

    const pendingPoints = gpsBuffer;
    gpsBuffer = [];

    await db.withExclusiveTransactionAsync(async (txn) => {
      for (const point of pendingPoints) {
        await txn.runAsync(
          `INSERT INTO gps_points (
            id,
            session_id,
            lap_id,
            recorded_at,
            elapsed_ms,
            latitude,
            longitude,
            speed_mps,
            accuracy_m,
            altitude_m,
            heading_deg,
            is_timing_crossing
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            session_id = excluded.session_id,
            lap_id = excluded.lap_id,
            recorded_at = excluded.recorded_at,
            elapsed_ms = excluded.elapsed_ms,
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            speed_mps = excluded.speed_mps,
            accuracy_m = excluded.accuracy_m,
            altitude_m = excluded.altitude_m,
            heading_deg = excluded.heading_deg,
            is_timing_crossing = excluded.is_timing_crossing;`,
          point.id,
          point.sessionId,
          point.lapId,
          toIsoString(point.sample.recordedAt),
          Math.round(point.sample.elapsedMs),
          point.sample.lat,
          point.sample.lng,
          point.sample.speedMps,
          point.sample.accuracyM,
          point.sample.altitudeM,
          point.sample.headingDeg,
          point.isTimingCrossing
        );
      }
    });
  }

  async function appendGpsSample(
    point: Omit<BufferedGpsPoint, 'isTimingCrossing'> & { isTimingCrossing?: 0 | 1 }
  ): Promise<void> {
    gpsBuffer.push({
      ...point,
      isTimingCrossing: point.isTimingCrossing ?? 0,
    });

    if (gpsBuffer.length >= flushPointCount) {
      await flushGpsBuffer();
    }
  }

  async function finalizeSession(input: FinalizeSessionInput): Promise<void> {
    await flushGpsBuffer();

    await db.runAsync(
      `UPDATE sessions
       SET ended_at = ?,
           status = ?,
           best_lap_ms = COALESCE(?, best_lap_ms),
           total_laps = COALESCE(?, total_laps),
           max_speed_kph = COALESCE(?, max_speed_kph),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?;`,
      input.endedAt,
      input.status ?? 'completed',
      input.bestLapMs ?? null,
      input.totalLaps ?? null,
      input.maxSpeedKph ?? null,
      input.sessionId
    );
  }

  return {
    createSession,
    startLap,
    finishLap,
    insertLapSector,
    appendGpsSample,
    flushGpsBuffer,
    finalizeSession,
    getBufferedPointCount: () => gpsBuffer.length,
  };
}
