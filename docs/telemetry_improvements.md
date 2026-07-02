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

## Improvement Priorities

### 1. Maximize Sampling Quality

Areas to review and tune:

- requested GPS sampling interval
- actual delivered sample cadence on device
- high-accuracy navigation mode behavior on iOS and Android
- battery/performance tradeoffs at higher sample rates

Potential future work:

- test `100ms` vs `200ms` sampling on real drives
- compare actual delivered frequency by device
- tune platform-specific options if needed

### 2. Improve Sample Validation

Current validation is basic.

Future work:

- tighter dynamic accuracy thresholds
- stronger impossible-jump detection
- outlier detection using neighboring points
- heading sanity improvements
- stronger speed consistency checks

Goal:

- reject bad points without throwing away useful real track data

### 3. Improve Display-Only Path Smoothing

The saved session path should look cleaner than the live path.

Future work:

- better moving average smoothing
- weighted smoothing instead of simple averaging
- display-only point thinning
- display-only path densification between points
- preserve corners while reducing zigzag noise

Goal:

- improve map readability without altering raw stored telemetry

### 4. Add Stronger Post-Processing

Post-session processing is one of the biggest quality opportunities because it has the full dataset and no live-time constraints.

Future work:

- full-session outlier removal
- re-run smoothing on the saved dataset
- reconstruct a cleaner polyline for display
- detect and suppress isolated spikes
- segment path cleanup by lap

Goal:

- saved session map should be cleaner and more believable than live rendering

### 5. Add Sensor Fusion

Current pipeline is still GPS-centric.

Future work:

- use heading more intentionally in path cleanup
- use GPS speed as a stronger signal for continuity
- add accelerometer input
- add gyroscope input
- fuse GPS + speed + heading + IMU for better path stability

Goal:

- improve continuity through corners
- improve behavior when GPS is weak or jittery

### 6. Prepare for External Hardware

External devices are a later feature, but the pipeline should be built so they plug into a strong processing system.

Future work:

- make telemetry ingestion source-agnostic
- support higher-rate external GPS streams
- support better speed/heading signals
- keep downstream filtering and processing reusable

Goal:

- external hardware should improve an already strong telemetry stack, not compensate for a weak one

## Guiding Rule

Raw recorded telemetry should remain intact whenever possible.

Improvements should usually happen in:

- validation
- derived timing
- display-only processing
- post-session reconstruction

This keeps the original data available while allowing better rendered results and better future processing.

## Recommended Next Areas After MVP

Highest-value next steps:

1. stronger saved-session post-processing
2. better display-only smoothing for session maps
3. tighter validation and outlier rejection
4. sampling-quality experiments at `100ms` vs `200ms`
5. heading/speed-assisted path cleanup
6. IMU fusion research and prototype

## Summary

Phone GPS is a limitation, but it is not an excuse for weak telemetry settings or weak processing.

The right approach is:

- maximize capture quality
- maximize processing quality
- keep raw data intact
- build a strong telemetry pipeline now

That way the app improves immediately on phone GPS, and will also be in a strong position when external hardware is added later.
