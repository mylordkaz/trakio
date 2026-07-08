// Feature flags for gating work that isn't ready to ship to users.

// External GPS (RaceBox) support is code-complete but unverified on hardware:
// the BLE connect, GNSS-config write, device-info read, and reconnect paths
// have only been unit-tested, not exercised against a real device. Keep this
// off until a RaceBox is available to validate end to end, then flip to true to
// expose device pairing. With it off, recording always uses the phone GPS.
export const EXTERNAL_GPS_ENABLED: boolean = false;

// Phase 2a IMU capture (docs/kalman/phase-2-imu-fusion.md): records raw phone
// DeviceMotion samples at ~50 Hz into imu_samples during recording sessions,
// for offline fusion benching only. No app behavior consumes them. Off until
// the capture path is validated on device; costs battery when on.
export const IMU_CAPTURE_ENABLED: boolean = false;
