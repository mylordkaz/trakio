# Phase 1 — App Integration (Detection Only, Behind a Flag)

**Precondition:** Phase 0 acceptance criteria passed, winning arm chosen
(alpha-beta or adaptive KF), report reviewed and approved by Kevin.

## 1. Goal

Feed crossing detection with filtered positions instead of raw fixes, for
**future recordings only**, behind a single feature flag, with a one-line
rollback. Nothing else in the app changes.

## 2. What changes — exhaustively

One integration point in `telemetry/session-runtime.ts`, inside
`handleAcceptedSample`, between validation and detection:

```
raw sample ── validation filter (unchanged) ──► stored RAW (unchanged)
                                          └──► filter.step(sample)
                                                    │ filtered lat/lng
                                                    ▼
                                          detectTimingLineCrossings(...)
```

- `constants/featureFlags.ts`: add `KALMAN_DETECTION_ENABLED: boolean`
  (same pattern as `EXTERNAL_GPS_ENABLED`). Default per Phase 0 outcome;
  rollback = flip to `false`.
- The filter instance lives in the runtime (created at `start()`, reset with
  the session). Estimated size of the integration diff: ~30 lines.
- Detection receives a sample whose `lat`/`lng` are the filtered estimate;
  `recordedAt`/`elapsedMs` are untouched (the unified session clock from the
  sources work is authoritative and stays so).

## 3. What does NOT change — exhaustively

- **Stored telemetry**: `gps_points` rows remain raw. The filter's output is
  never written anywhere.
- **Existing sessions**: timing is capture-time; history is immutable.
- **Display**: the map pipeline keeps reading raw stored points. (A filtered
  display line would require storing derived points — explicitly rejected.)
- **Quality assessment / `≈` flags**: computed from raw sample timing and
  accuracy exactly as today. Dropout laps stay flagged.
- **Validation filter** (`filters.ts`): unchanged; the filter consumes only
  samples that passed it. Innovation gating is defense-in-depth after it,
  not a replacement.
- **UI values** (speed bar, max speed, braking est.): raw. One consumer
  changes: detection. (Filtered speed for UI is a possible later nicety —
  out of scope.)
- Schema, migrations, i18n, screens: untouched.

## 4. Source-rate behavior

The filter is dt-parameterized and source-agnostic:

- Phone GPS ~1 Hz: the Phase 0 tuned parameters apply as-is.
- RaceBox 25 Hz (when `EXTERNAL_GPS_ENABLED`): same code path; per-sample
  `speedAccuracyMps` feeds R_v when present (already specified in Phase 0
  §4.5). Bench must have run the 25 Hz synthetic (Phase 0 §7.6) before this
  flag combination ships.
- Source switch mid-session (phone ↔ RaceBox): treated as a potential clock
  and geometry discontinuity → filter resets via the existing
  `resetGapS` rule; one-line explicit reset hook on source change if the
  lifecycle exposes it.

## 5. Validation protocol (device)

1. **Pre-build bench re-run**: `bench/run.ts` green with the exact constants
   being shipped (no "tuned in bench, shipped different numbers").
2. **TestFlight session** at Tsukuba (or any drive): record normally, export
   JSON, run it through the bench. On-device stored lap times must equal the
   bench's winning-arm replay of the same file within ±2 ms — proves the
   shipped integration matches the validated code path.
3. **Transponder day (when available)**: repeat the July comparison. Accept:
   clean-lap mean |err| ≤ naive's historical 0.08 s reference; dropout laps
   unchanged and flagged.
4. **Regression drive-throughs**: pit-in flow, parked-on-line arming
   protection, sector splits, `≈` flags — all unchanged behavior.

## 6. Acceptance / rollback / kill

- **Accept**: device validation §5 passes; no anomaly reports across a real
  track day.
- **Rollback**: flip `KALMAN_DETECTION_ENABLED = false` — detection reverts
  to raw positions instantly; no data cleanup needed (nothing derived was
  stored).
- **Kill**: if device results contradict the bench (they shouldn't — same
  code path — but reality gets a vote), flag off, capture the exported
  session into `bench/data/`, and reproduce offline before any retry.

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Filter lag shifts apexes → subtle crossing-time bias the bench missed | σa stress test (Phase 0 §7.5) + transponder day |
| Behavior differs between bench replay and live (ordering, async) | Bench replays through the production runtime, not a reimplementation; §5.2 equality check |
| RaceBox 25 Hz surfaces a perf or numeric issue | Synthetic 25 Hz test in Phase 0; flag combination gated until then |
| Silent divergence later (new code paths bypass the filter) | The filter is called in exactly one place; unit test asserts detection input == filter output when flag on |
