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
  Doppler speed mismatch); laps bounded by a degraded crossing are flagged
  (`laps.is_timing_estimated`, shown as a leading tilde). A Doppler
  re-timing fallback was built and then removed: validated against circuit
  transponder times, constant-speed projection made dropout-lap errors worse
  (corner-exit acceleration breaks the assumption) — naive interpolation plus
  an honest flag wins until a proper state estimator exists
- serialized sample processing (no concurrent crossing detection races)
- stale `recording` sessions recovered as `aborted` on startup
- live warnings for GPS loss, accuracy degradation, and app-backgrounding

## Current Limitations

The current telemetry pipeline is functional, but still limited in these ways:

- foreground-only recording: backgrounding the app pauses capture (warned
  live and flagged, but not prevented; background location is future work)
- iOS sampling capped at ~1 Hz without external hardware
- no state estimation or sensor fusion — evaluated and rejected on real
  data, not missing (see "Evaluated and rejected on evidence" below)

## Implemented (July 2026 telemetry overhaul)

The original priority list from this document is now largely done — see
Current State above for the full inventory. In summary:

- validation: positional jump rejection with accuracy-scaled bounds,
  out-of-order rejection, sentinel normalization (was priority 2)
- display: smoothing, spike suppression, thinning (Douglas-Peucker),
  densification (Catmull-Rom), per-lap segmentation with honest gaps at
  dropouts (was priorities 3 and 4)
- timing: crossing-quality assessment with per-lap estimated flags

Field validation: a 13-lap Tsukuba session (2026-07-04) against the circuit
transponder showed clean crossings within ±0.08 s. The ~1 s outliers came
from 5-11 s holes in the accepted stream around the start/finish gantry;
those laps are flagged.

## Implemented (July 2026 continuity phase — `docs/line-continuity.md`)

- **Capture everything**: rejected fixes stored in a quarantine
  (`rejected_gps_points`, with reason) instead of discarded; 50 Hz phone IMU
  capture (`imu_samples`); export v3 carries both. This settled the dropout
  question with data: most mid-session holes were **self-inflicted** — the
  jump filter rejecting good fixes after a displaced anchor — not GPS
  silence.
- **Cascade re-anchor** (capture): a second consecutive impossible-jump
  consistent with the previously rejected fix re-anchors onto the rejected
  chain, ending the cascade at its source.
- **Crossing recovery** (detection): hole-spanning segments crossing the
  gate extension within a measured margin recover the lap, flagged `≈` —
  masked-boundary bench went from losing every lap at 11 s holes to 0/14.
- **Line continuity** (display): quarantined fixes merged into the line at
  render time; every lap clipped to start and end exactly on the
  start/finish line. Continuous per-lap lines from phone data alone.
- Second transponder validation (2026-07-19, 13 laps): clean laps within
  64 ms (mean 25 ms), best lap within 2 ms — while the circuit transponder
  itself missed two passings that trakio caught.

## Evaluated and rejected on evidence (see `docs/kalman/`)

- **GPS-only Kalman filtering for detection**: 0/57 configurations valid on
  real data; corner lag slides crossings off finite gates and loses laps.
- **Doppler re-timing across dropouts**: worsened real lap error
  (0.383 → 0.462 s mean); removed.
- **Phone IMU fusion for bridging**: CoreMotion absorbs sustained
  acceleration into its gravity estimate; 57–131 m bridge errors vs the
  ≤12 m requirement. Capture stays (research dataset); fusion does not ship.

## Remaining Work

### 1. Sampling-quality experiments

- measure actual delivered cadence per device; test `100ms` vs `200ms` on
  Android real drives (iOS is capped at ~1 Hz by CoreLocation regardless)
- battery/performance tradeoffs at higher sample rates

### 2. Multi-lap consensus

- many laps of the same track describe the same corridor; a consensus line can
  correct confident-but-wrong drift that single-lap processing cannot detect
- also a candidate for a persistent post-session reconstruction pass

### 3. Background recording

- startLocationUpdatesAsync + TaskManager with AutomotiveNavigation activity
  type, UIBackgroundModes location, Android foreground service
- removes the app-backgrounding interruption class entirely

### 4. External hardware

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

1. multi-lap consensus line for drift correction
2. background recording
3. Android sampling-cadence experiments

## Summary

Phone GPS is a limitation, but it is not an excuse for weak telemetry settings or weak processing.

The right approach is:

- maximize capture quality
- maximize processing quality
- keep raw data intact
- build a strong telemetry pipeline now

That way the app improves immediately on phone GPS, and will also be in a strong position when external hardware is added later.
