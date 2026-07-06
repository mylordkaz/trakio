# Telemetry Quality Improvements

## Goal

Phone GPS has known accuracy limits, but the app should still use the best possible settings and processing pipeline.

The objective is:

- maximize the quality of the data we capture now
- maximize the quality of the timing and path processing now
- build the telemetry pipeline in a way that will also benefit future external hardware support

Even with better GPS hardware later, weak sampling, weak filtering, or weak processing would still limit final quality.

So the current priority is to improve the telemetry pipeline itself as much as possible.

## Current State

Current implementation already includes:

- high-accuracy location mode via `BestForNavigation`
- target sampling interval of `200ms` (~5 Hz requested; the `timeInterval`
  option is Android-only — iOS delivers ~1 Hz from CoreLocation)
- start/finish and sector crossing detection using segment intersection in a
  locally metric projection (longitude scaled by cos latitude), handling
  multiple crossings per movement segment in travel order
- interpolated crossing timestamps for lap and sector timing
- minimum-crossing-speed gate so a car parked on a timing line does not arm
  laps from GPS jitter
- sample filtering (`telemetry/filters.ts`):
  - reject poor accuracy over threshold
  - reject out-of-order timestamps (stored telemetry is strictly monotonic)
  - positional impossible-jump rejection with an accuracy-scaled bound,
    applied whether or not the device reports a speed
  - normalize invalid sentinels (iOS speed/heading `-1`, non-positive accuracy)
  - derive speed from movement when the device reports none
- display-only map pipeline (`utils/displayLine.ts`, raw data untouched):
  - accuracy filter, split at GPS dropouts instead of bridging them
  - isolated-spike rejection (covers data recorded before the jump-filter fix)
  - endpoint-preserving weighted smoothing
  - Douglas-Peucker simplification with a display point budget
  - centripetal Catmull-Rom densification
- crossing-quality assessment (segment duration, anchor accuracy, chord vs
  Doppler speed mismatch); degraded crossings are re-timed by projecting from
  the newest trustworthy fix along Doppler speed/heading, and affected laps
  are flagged (`laps.is_timing_estimated`, shown as a leading tilde)
- display line joins short no-data holes (GPS shadows) with a spline anchored
  on measured points both sides; pit-stop-length holes stay split
- serialized sample processing (no concurrent crossing detection races)
- stale `recording` sessions recovered as `aborted` on startup
- live warnings for GPS loss, accuracy degradation, and app-backgrounding

## Current Limitations

The current telemetry pipeline is functional, but still limited in these ways:

- foreground-only recording: backgrounding the app pauses capture (warned
  live and flagged, but not prevented; background location is future work)
- no Kalman or similar state estimator
- no heading/speed fusion for path reconstruction
- no accelerometer/gyroscope fusion
- iOS sampling capped at ~1 Hz without external hardware

## Implemented (July 2026 telemetry overhaul)

The original priority list from this document is now largely done — see
Current State above for the full inventory. In summary:

- validation: positional jump rejection with accuracy-scaled bounds,
  out-of-order rejection, sentinel normalization (was priority 2)
- display: accuracy-weighted smoothing, spike suppression, thinning
  (Douglas-Peucker), densification (Catmull-Rom), per-lap segmentation,
  GPS-shadow hole joining (was priorities 3 and 4)
- timing: crossing-quality assessment and Doppler speed/heading re-timing of
  degraded crossings with per-lap estimated flags (first slice of priority 5's
  "use GPS speed/heading as a stronger signal")

Field validation: a 13-lap Tsukuba session against the circuit transponder
showed clean crossings within ±0.08 s; the ~1 s outliers were traced to the
start/finish GPS shadow and are what the re-timing fallback addresses.

## Remaining Work

### 1. Sampling-quality experiments

- measure actual delivered cadence per device; test `100ms` vs `200ms` on
  Android real drives (iOS is capped at ~1 Hz by CoreLocation regardless)
- battery/performance tradeoffs at higher sample rates

### 2. State estimation (Kalman)

- constant-velocity filter fusing position with Doppler speed/heading
- feeds detection with stabilized positions through GPS shadows (would reduce
  how often the re-timing fallback and estimated flags are needed at all)
- raw stored telemetry stays untouched; the filter output is derived

### 3. Multi-lap consensus

- many laps of the same track describe the same corridor; a consensus line can
  correct confident-but-wrong drift that single-lap processing cannot detect
- also a candidate for a persistent post-session reconstruction pass

### 4. IMU fusion

- accelerometer/gyroscope input for continuity through corners and shadows

### 5. Background recording

- startLocationUpdatesAsync + TaskManager with AutomotiveNavigation activity
  type, UIBackgroundModes location, Android foreground service
- removes the app-backgrounding interruption class entirely

### 6. External hardware

- source-agnostic telemetry ingestion; higher-rate external GPS streams plug
  into the same filtering/detection/display pipeline

## Guiding Rule

Raw recorded telemetry should remain intact whenever possible.

Improvements should usually happen in:

- validation
- derived timing
- display-only processing
- post-session reconstruction

This keeps the original data available while allowing better rendered results and better future processing.

## Recommended Next Areas

Highest-value next steps, in order:

1. constant-velocity Kalman filter feeding detection (see Remaining Work 2)
2. multi-lap consensus line for drift correction
3. background recording
4. Android sampling-cadence experiments
5. IMU fusion research and prototype

## Summary

Phone GPS is a limitation, but it is not an excuse for weak telemetry settings or weak processing.

The right approach is:

- maximize capture quality
- maximize processing quality
- keep raw data intact
- build a strong telemetry pipeline now

That way the app improves immediately on phone GPS, and will also be in a strong position when external hardware is added later.
