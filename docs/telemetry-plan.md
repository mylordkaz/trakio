# Telemetry Plan

## Scope

The active MVP focus is:
- track selection
- live GPS capture
- automatic lap detection
- sector timing
- local session storage

## Architecture

### `telemetry/location`

Responsibility:
- permission checks
- start/stop live subscription
- normalize raw Expo location output

Non-responsibility:
- no lap timing logic
- no circuit detection logic
- no sector ordering logic
- no session state decisions

This layer should stay as a thin device adapter.

### `telemetry/filters`

Responsibility:
- reject impossible jumps
- reject very poor accuracy
- clamp or null invalid heading values
- optionally derive speed when device speed is missing or unstable

This layer sits between raw normalized samples and detection.

Its purpose is to keep detection purely geometric and deterministic.

### `telemetry/detection`

Responsibility:
- pure crossing detection
- segment-vs-line intersection checks
- deterministic event generation from sanitized samples

Non-responsibility:
- no Expo/device API usage
- no permission logic
- no UI logic
- no persistence logic

This layer should operate only on:
- the previous sanitized sample
- the current sanitized sample
- the active track timing lines
- timing constraints supplied by runtime/config

### `telemetry/session-runtime`

Responsibility:
- own the recording state machine
- own allowed transitions
- consume sanitized samples
- consume detection outputs
- orchestrate lap lifecycle and persistence calls

This is not just a state container.

It should enforce transitions such as:
- `idle -> recording`
- `recording -> armed`
- `armed -> lap_in_progress`
- `lap_in_progress -> sector_n`
- `final sector -> lap_complete`
- `recording -> stopped`

UI should read runtime state, not decide lap transitions itself.

### `db/session-recorder`

Responsibility:
- SQLite persistence for session recording
- immediate event writes for low-frequency events
- buffered GPS writes for high-frequency telemetry samples

Immediate writes:
- create session
- start lap
- finish lap
- insert sector split
- finalize session

Buffered writes:
- GPS point batches

Flush conditions:
- every `N` points
- every `X` seconds
- stop/finalize
- later: app state change if needed

## Telemetry Sample Contract

Each normalized sample should use this shape:

```ts
type TelemetrySample = {
  recordedAt: number;
  elapsedMs: number;
  lat: number;
  lng: number;
  speedMps: number | null;
  accuracyM: number | null;
  headingDeg: number | null;
  altitudeM: number | null;
  source: 'gps';
};
```

Definitions:
- `recordedAt`: wall-clock timestamp
- `elapsedMs`: monotonic session-relative elapsed time used for lap timing logic
- `lat` / `lng`: sample position
- `speedMps`: device-reported or derived speed
- `accuracyM`: horizontal accuracy if available
- `headingDeg`: valid heading or `null`
- `altitudeM`: altitude if available
- `source`: sample origin, currently `'gps'`

Lap timing logic should use `elapsedMs`, not only wall-clock time.

## Detection Model

Track timing uses line crossings, not proximity-to-point checks.

Inputs:
- previous sanitized sample `P1`
- current sanitized sample `P2`
- timing line endpoints `A` and `B`

Core rule:
- detect whether movement segment `P1 -> P2` intersects timing line `A -> B`

Detection outputs should represent events such as:
- `start_finish crossed`
- `sector crossed`

First-pass safeguards:
- debounce duplicate crossings
- enforce expected sector order
- enforce minimum lap time
- use `elapsedMs` for timing thresholds

## Session Runtime State Machine

Initial state:
- `idle`

Recording flow:
- `idle -> recording`
- `recording -> armed`
- `armed -> lap_in_progress`
- `lap_in_progress -> sector_1_done -> sector_2_done -> ...`
- `final sector -> lap_complete`
- `lap_complete -> next lap in progress`
- `recording -> stopped`

Meaning:
- `recording`: session active, waiting for valid arming conditions
- `armed`: ready to accept the next start/finish crossing as lap start
- `lap_in_progress`: active timed lap
- `sector_n_done`: sector boundary progression within current lap
- `stopped`: session ended, buffers flushed, DB finalized

Runtime owns:
- current session id
- current lap id
- current lap number
- lap start elapsed time
- last crossed sector index
- last crossing elapsed time
- current best lap
- buffer coordination with `db/session-recorder`

## Recorder Strategy

`db/session-recorder` should be optimized for the recording hot path.

Recommended strategy:
- write important lifecycle events immediately
- batch GPS point inserts in memory

Do not synchronously write every GPS point from the live subscription path if it can be avoided.

Recommended API direction:
- `createSession(...)`
- `startLap(...)`
- `finishLap(...)`
- `insertLapSector(...)`
- `appendGpsSample(...)`
- `flushGpsBuffer()`
- `finalizeSession(...)`

Expo SQLite is appropriate for this recorder layer.

## Suggested Module Layout

Planned files:
- `telemetry/types.ts`
- `telemetry/location.ts`
- `telemetry/filters.ts`
- `telemetry/detection.ts`
- `telemetry/session-runtime.ts`
- `db/session-recorder.ts`

## Implementation Order

1. Add `expo-location`
2. Create `telemetry/types.ts`
3. Implement `telemetry/location.ts`
4. Implement `telemetry/filters.ts`
5. Implement `db/session-recorder.ts`
6. Implement `telemetry/detection.ts`
7. Implement `telemetry/session-runtime.ts`
8. Wire the recording screen to runtime
9. Replace mock recording and post-session flows with real session data

## Excluded

- background tracking
- external GPS receivers
- full track geometry
- predictive timing
- cloud sync
