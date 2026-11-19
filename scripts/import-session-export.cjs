#!/usr/bin/env node

// Loads a session export (format trakio-session-export, version 3 or later)
// into the booted iOS simulator's database, so a recorded session can be
// opened in a development build. The session's track must already exist in
// that database; tracks and timing lines are not imported.
//
//   node scripts/import-session-export.cjs <export.json> [--replace] [--db <path to trakio.db>]

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const BUNDLE_ID = 'com.trakio.mobile';
const MIN_USER_VERSION = 19;
const REQUIRED_LAP_COLUMNS = ['started_latitude', 'started_longitude', 'ended_latitude', 'ended_longitude'];

function fail(message) {
  console.error(`import: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { replace: false, db: null, file: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--replace') args.replace = true;
    else if (argv[i] === '--db') args.db = argv[++i];
    else if (!args.file) args.file = argv[i];
    else fail(`unexpected argument ${argv[i]}`);
  }
  if (!args.file) fail('usage: node scripts/import-session-export.cjs <export.json> [--replace] [--db <trakio.db>]');
  return args;
}

function simulatorDbPath() {
  const container = execFileSync(
    'xcrun',
    ['simctl', 'get_app_container', 'booted', BUNDLE_ID, 'data'],
    { encoding: 'utf8' }
  ).trim();
  return path.join(container, 'Documents', 'SQLite', 'trakio.db');
}

function query(dbPath, sql) {
  const out = execFileSync('/usr/bin/sqlite3', ['-json', dbPath, sql], { encoding: 'utf8' }).trim();
  return out ? JSON.parse(out) : [];
}

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const args = parseArgs(process.argv.slice(2));
const file = path.resolve(args.file);
if (!fs.existsSync(file)) fail(`${file} does not exist`);
const dbPath = args.db ? path.resolve(args.db) : simulatorDbPath();
if (!fs.existsSync(dbPath)) fail(`${dbPath} does not exist; launch the app once in the simulator first`);

const header = JSON.parse(fs.readFileSync(file, 'utf8'));
if (header.format !== 'trakio-session-export' || !(header.version >= 3)) {
  fail('not a trakio-session-export of version 3 or later');
}
const sessionId = header.session.id;
const trackId = header.session.trackId;

const [{ user_version: userVersion }] = query(dbPath, 'PRAGMA user_version;');
if (userVersion < MIN_USER_VERSION) fail(`database schema ${userVersion} is older than ${MIN_USER_VERSION}; run the app to migrate`);
const lapColumns = query(dbPath, 'PRAGMA table_info(laps);').map((column) => column.name);
for (const column of REQUIRED_LAP_COLUMNS) {
  if (!lapColumns.includes(column)) fail(`laps.${column} is missing; run the app to migrate`);
}
if (query(dbPath, `SELECT 1 FROM tracks WHERE id = ${quote(trackId)};`).length === 0) {
  fail(`track ${trackId} does not exist in ${dbPath}`);
}
if (query(dbPath, `SELECT 1 FROM sessions WHERE id = ${quote(sessionId)};`).length > 0 && !args.replace) {
  fail(`session ${sessionId} already exists; pass --replace to overwrite it`);
}

const sql = `
PRAGMA foreign_keys = ON;
BEGIN;
CREATE TEMP TABLE doc AS SELECT json(readfile(${quote(file)})) AS j;
${args.replace ? `DELETE FROM sessions WHERE id = ${quote(sessionId)};` : ''}

INSERT INTO sessions (id, name, user_id, track_id, started_at, ended_at, status, notes, best_lap_ms, total_laps,
  max_speed_kph, car, condition, temperature_c, created_at, updated_at)
SELECT json_extract(j, '$.session.id'), json_extract(j, '$.session.name'), json_extract(j, '$.session.userId'),
  json_extract(j, '$.session.trackId'), json_extract(j, '$.session.startedAt'), json_extract(j, '$.session.endedAt'),
  json_extract(j, '$.session.status'), json_extract(j, '$.session.notes'), json_extract(j, '$.session.bestLapMs'),
  coalesce(json_extract(j, '$.session.totalLaps'), 0), json_extract(j, '$.session.maxSpeedKph'),
  json_extract(j, '$.session.car'), json_extract(j, '$.session.condition'), json_extract(j, '$.session.temperatureC'),
  coalesce(json_extract(j, '$.session.createdAt'), CURRENT_TIMESTAMP), coalesce(json_extract(j, '$.session.updatedAt'), CURRENT_TIMESTAMP)
FROM doc;

INSERT INTO laps (id, session_id, lap_number, started_at, ended_at, lap_time_ms, is_out_lap, is_in_lap, is_timing_estimated,
  is_invalid, max_speed_kph, started_latitude, started_longitude, ended_latitude, ended_longitude, created_at)
SELECT json_extract(l.value, '$.id'), ${quote(sessionId)}, json_extract(l.value, '$.lapNumber'),
  json_extract(l.value, '$.startedAt'), json_extract(l.value, '$.endedAt'), json_extract(l.value, '$.lapTimeMs'),
  coalesce(json_extract(l.value, '$.isOutLap'), 0), coalesce(json_extract(l.value, '$.isInLap'), 0),
  coalesce(json_extract(l.value, '$.isTimingEstimated'), 0), coalesce(json_extract(l.value, '$.isInvalid'), 0),
  json_extract(l.value, '$.maxSpeedKph'), json_extract(l.value, '$.startedLatitude'), json_extract(l.value, '$.startedLongitude'),
  json_extract(l.value, '$.endedLatitude'), json_extract(l.value, '$.endedLongitude'),
  coalesce(json_extract(l.value, '$.createdAt'), CURRENT_TIMESTAMP)
FROM doc, json_each(doc.j, '$.laps') AS l;

INSERT INTO lap_sectors (id, lap_id, sector_index, split_time_ms, created_at)
SELECT json_extract(s.value, '$.id'), json_extract(l.value, '$.id'), json_extract(s.value, '$.sectorIndex'),
  json_extract(s.value, '$.splitTimeMs'), coalesce(json_extract(s.value, '$.createdAt'), CURRENT_TIMESTAMP)
FROM doc, json_each(doc.j, '$.laps') AS l, json_each(l.value, '$.sectors') AS s;

INSERT INTO gps_points (id, session_id, lap_id, recorded_at, elapsed_ms, latitude, longitude, speed_mps, accuracy_m,
  altitude_m, heading_deg, is_timing_crossing, source, i_tow, time_accuracy_ns, nanosecond, g_force_x, g_force_y, g_force_z,
  rotation_rate_x, rotation_rate_y, rotation_rate_z, vertical_accuracy_m, speed_accuracy_mps, heading_accuracy_deg, pdop,
  satellite_count, fix_type, fix_flags, validity_flags, date_time_flags, lat_lon_flags, battery_level, is_charging,
  input_voltage_v, created_at)
SELECT json_extract(p.value, '$.id'), ${quote(sessionId)}, json_extract(p.value, '$.lapId'), json_extract(p.value, '$.recordedAt'),
  json_extract(p.value, '$.elapsedMs'), json_extract(p.value, '$.latitude'), json_extract(p.value, '$.longitude'),
  json_extract(p.value, '$.speedMps'), json_extract(p.value, '$.accuracyM'), json_extract(p.value, '$.altitudeM'),
  json_extract(p.value, '$.headingDeg'), coalesce(json_extract(p.value, '$.isTimingCrossing'), 0), json_extract(p.value, '$.source'),
  json_extract(p.value, '$.iTow'), json_extract(p.value, '$.timeAccuracyNs'), json_extract(p.value, '$.nanosecond'),
  json_extract(p.value, '$.gForceX'), json_extract(p.value, '$.gForceY'), json_extract(p.value, '$.gForceZ'),
  json_extract(p.value, '$.rotationRateX'), json_extract(p.value, '$.rotationRateY'), json_extract(p.value, '$.rotationRateZ'),
  json_extract(p.value, '$.verticalAccuracyM'), json_extract(p.value, '$.speedAccuracyMps'), json_extract(p.value, '$.headingAccuracyDeg'),
  json_extract(p.value, '$.pdop'), json_extract(p.value, '$.satelliteCount'), json_extract(p.value, '$.fixType'),
  json_extract(p.value, '$.fixFlags'), json_extract(p.value, '$.validityFlags'), json_extract(p.value, '$.dateTimeFlags'),
  json_extract(p.value, '$.latLonFlags'), json_extract(p.value, '$.batteryLevel'), json_extract(p.value, '$.isCharging'),
  json_extract(p.value, '$.inputVoltageV'), coalesce(json_extract(p.value, '$.createdAt'), CURRENT_TIMESTAMP)
FROM doc, json_each(doc.j, '$.gpsPoints') AS p;

INSERT INTO imu_samples (session_id, recorded_at, interval_ms, accel_x, accel_y, accel_z, accel_incl_gravity_x,
  accel_incl_gravity_y, accel_incl_gravity_z, rotation_alpha, rotation_beta, rotation_gamma, rotation_rate_alpha,
  rotation_rate_beta, rotation_rate_gamma)
SELECT ${quote(sessionId)}, json_extract(s.value, '$.recordedAt'), json_extract(s.value, '$.intervalMs'),
  json_extract(s.value, '$.accel[0]'), json_extract(s.value, '$.accel[1]'), json_extract(s.value, '$.accel[2]'),
  json_extract(s.value, '$.accelInclGravity[0]'), json_extract(s.value, '$.accelInclGravity[1]'), json_extract(s.value, '$.accelInclGravity[2]'),
  json_extract(s.value, '$.rotation[0]'), json_extract(s.value, '$.rotation[1]'), json_extract(s.value, '$.rotation[2]'),
  json_extract(s.value, '$.rotationRate[0]'), json_extract(s.value, '$.rotationRate[1]'), json_extract(s.value, '$.rotationRate[2]')
FROM doc, json_each(doc.j, '$.imuSamples') AS s;

INSERT INTO rejected_gps_points (id, session_id, recorded_at, elapsed_ms, latitude, longitude, speed_mps, accuracy_m,
  altitude_m, heading_deg, rejection_reason)
SELECT ${quote(sessionId)} || ':rejected:' || r.key, ${quote(sessionId)}, json_extract(r.value, '$.recordedAt'),
  json_extract(r.value, '$.elapsedMs'), json_extract(r.value, '$.latitude'), json_extract(r.value, '$.longitude'),
  json_extract(r.value, '$.speedMps'), json_extract(r.value, '$.accuracyM'), json_extract(r.value, '$.altitudeM'),
  json_extract(r.value, '$.headingDeg'), json_extract(r.value, '$.rejectionReason')
FROM doc, json_each(doc.j, '$.rejectedGpsPoints') AS r;

COMMIT;
`;

const result = spawnSync('/usr/bin/sqlite3', ['-bail', dbPath], { input: sql, encoding: 'utf8' });
if (result.status !== 0) fail(result.stderr.trim() || 'sqlite3 failed');

const counts = query(
  dbPath,
  `SELECT (SELECT count(*) FROM laps WHERE session_id = ${quote(sessionId)}) AS laps,
          (SELECT count(*) FROM gps_points WHERE session_id = ${quote(sessionId)}) AS gps_points,
          (SELECT count(*) FROM imu_samples WHERE session_id = ${quote(sessionId)}) AS imu_samples,
          (SELECT count(*) FROM rejected_gps_points WHERE session_id = ${quote(sessionId)}) AS rejected_gps_points;`
)[0];
console.log(`imported session ${sessionId} (${header.session.name ?? 'unnamed'}) into ${dbPath}`);
console.log(`laps ${counts.laps}, gps points ${counts.gps_points}, imu samples ${counts.imu_samples}, quarantined fixes ${counts.rejected_gps_points}`);
