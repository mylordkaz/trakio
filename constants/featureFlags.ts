// Feature flags for gating work that isn't ready to ship to users.

// External GPS device pairing (RaceBox, Qstarz BL-1000GT/BL-818GT). Enabled so
// Qstarz can validate their devices against a release build. Both vendors'
// BLE paths are unit-tested against vendor protocol captures but not yet
// exercised on hardware by us; RaceBox in particular still has no on-device
// validation of its connect/config/reconnect paths.
export const EXTERNAL_GPS_ENABLED: boolean = true;

// Phase 2a IMU capture (docs/kalman/phase-2-imu-fusion.md): records raw phone
// DeviceMotion samples at ~50 Hz into imu_samples during recording sessions,
// for offline fusion benching only. No app behavior consumes them. ON for the
// Phase 2b capture campaign (street-drive validation, then Tsukuba): expect
// roughly 10 MB of rows per 30 recorded minutes and an unmeasured battery
// cost — measuring it is part of the campaign.
export const IMU_CAPTURE_ENABLED: boolean = true;

// Crossing recovery: when a GPS hole spans a timing line and the chord
// between the surviving fixes crosses the line's extension just past the
// finite gate, the crossing physically happened (the car cannot teleport
// around a gate spanning the track) and is recovered, chord-timed, and
// flagged ≈ via the existing degraded-quality path. Bench-proven to fire
// zero times on all clean recorded sessions.
export const CROSSING_RECOVERY_ENABLED: boolean = true;

// Cascade re-anchor: when consecutive fixes are rejected as impossible jumps
// but agree with EACH OTHER, the world moved and the old anchor was the liar
// (a displaced fix that got accepted) — accept the chain and move on.
// Measured at Tsukuba 2026-07-19: one displaced anchor caused 3-4 clean
// 4 m-accuracy fixes to be discarded per event; re-anchoring caps such holes
// at ~2 s. Rejected fixes are still quarantined for display/analysis.
export const JUMP_REANCHOR_ENABLED: boolean = true;

// Full raw telemetry is a development-only diagnostic path, not a
// customer-facing Pro export. TEMPORARILY forced on for the Qstarz validation
// TestFlight build: vendor sessions are the only real-device Qstarz data that
// will ever exist, and their exported JSON is the feedback channel. MUST be
// reverted to
//   __DEV__ || Constants.expoConfig?.extra?.rawDataExportEnabled === true
// (with the expo-constants import) before any App Store submission.
export const RAW_DATA_EXPORT_ENABLED: boolean = true;
