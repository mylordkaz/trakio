// Feature flags for gating work that isn't ready to ship to users.

// External GPS (RaceBox) support is code-complete but unverified on hardware:
// the BLE connect, GNSS-config write, device-info read, and reconnect paths
// have only been unit-tested, not exercised against a real device. Keep this
// off until a RaceBox is available to validate end to end, then flip to true to
// expose device pairing. With it off, recording always uses the phone GPS.
export const EXTERNAL_GPS_ENABLED: boolean = false;
