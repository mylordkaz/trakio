// Feature flags for gating work that isn't ready to ship to users.

// External GPS (RaceBox) support is code-complete but unverified on hardware:
// the BLE connect, GNSS-config write, device-info read, and reconnect paths
// have only been unit-tested, not exercised against a real device. Keep this
// off until a RaceBox is available to validate end to end, then flip to true to
// expose device pairing. With it off, recording always uses the phone GPS.
export const EXTERNAL_GPS_ENABLED: boolean = false;

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
