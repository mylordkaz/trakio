# Kalman Filter — Project Overview

State estimation for trakio's telemetry pipeline: fuse GPS position and
Doppler velocity (later: IMU acceleration) into a continuous estimate of the
car's position and velocity, so lap/sector timing gets its input from
something better than each raw fix taken in isolation.

This folder is the project's memory. Each phase has its own spec, written so
work can stop and resume months later without re-deriving anything.

| Phase | Doc | Scope | Status |
| --- | --- | --- | --- |
| 0 | [phase-0-offline-bench.md](phase-0-offline-bench.md) | Filter module + offline bench on real data. **No app changes.** | **Complete 2026-07-07 — kill criterion fired** (see Outcome in the phase doc) |
| 1 | [phase-1-app-integration.md](phase-1-app-integration.md) | Wire filter into detection behind a feature flag | **Cancelled** — 0/57 configs valid; filtering loses laps (gate-edge slip) |
| 2 | [phase-2-imu-fusion.md](phase-2-imu-fusion.md) | IMU fusion | **Path B (phone IMU) killed on real street data** — CoreMotion filters away sustained acceleration (57–131 m bridge errors vs ≤12 m needed). Path A (RaceBox raw IMU) pending hardware; bench fully armed for it |

**Where the dropout problem actually went (2026-07-19/20):** the
capture-everything quarantine proved most mid-session holes were
*self-inflicted* jump-filter cascades, not GPS silence — fixed at capture
(re-anchor), detection (crossing recovery), and display (quarantine merge +
laps clipped at the line). See `docs/line-continuity.md`. Estimation remains
killed; the continuity thread delivered what it was chartered for.

**Phase 0 verdict in one line:** on real 1 Hz data, GPS-only filtering for
detection improved nothing (clean laps are already at the GPS-vs-transponder
noise floor) and introduced a categorical regression — corner lag displaces
the path laterally by 5–19 m, which slides crossings along the *finite*
timing gates and, near a gate's edge, off it entirely: **lost laps**. The
filter and bench remain in the repo (`telemetry/kalman.ts`, `bench/`) as the
regression harness and skeleton for Phase 2, where measured IMU acceleration
removes the lag mechanism itself.

Phases are gated: each one starts only after the previous one's acceptance
criteria pass **and** the results have been reviewed and approved. Every phase
has an explicit kill criterion — evidence, not sunk cost, decides shipping.

## Why this project exists

Field validation (2026-07-04 Tsukuba, 13 laps against the circuit
transponder) established:

- Clean GPS crossings are already timed within **±0.08 s** using naive
  segment interpolation. There is little headroom there.
- The phone occasionally stops delivering fixes entirely for **5–11 s**
  (total fix loss near the start/finish gantry; accuracy is excellent on both
  sides). Laps whose crossing falls inside such a dropout are off by
  **±1.0–1.1 s**. They are flagged `≈` (`laps.is_timing_estimated`).
- GPS-only estimation **cannot** fix those dropout laps: with no measurements
  for 5–11 s, any filter degenerates to constant-velocity extrapolation,
  which was empirically shown to make things worse (see re-timer post-mortem
  below). Fixing dropout laps requires measurements that keep flowing during
  GPS silence — that is IMU fusion, Phase 2.

So the honest value ordering is:

1. **Phase 0/1 (GPS-only)**: modest gains — tighter clean-crossing precision,
   bridging of short (1–3 s) dropouts, robustness against
   displaced-but-confident fixes, smoother speed, and the ingestion backbone
   for high-rate external GPS. May turn out not worth shipping; the bench
   decides.
2. **Phase 2 (IMU)**: the actual attack on the ±1.1 s dropout laps.

## Benchmark datasets (ground truth)

Real sessions exported via the app's **Export Data** button
(`format: trakio-session-export`). They are the regression bench for all
phases. Keep the files; they are irreplaceable ground truth.

A third Tsukuba session joined the bench on 2026-07-19
(`trakio-session-1784442643247-9ybpbqn.json`, export v3: 13 laps, 12
quarantined fixes, 70k IMU samples, transponder truth for 12 laps): clean
laps within 64 ms of the transponder (mean 25 ms, best lap Δ 2 ms) while the
transponder itself missed two passings. Primary bench for
`bench/continuity-validation.ts`. Two street drives (v2/v3) back the IMU
stream-quality and reconstruction benches.

| | July session | April session |
| --- | --- | --- |
| File | `trakio-session-1783145467725-su66dcp.json` | `trakio-session-1777178068619-hec6w8m.json` |
| Recorded | 2026-07-04, Tsukuba 2000 | 2026-04-26, Tsukuba 2000 |
| Laps | 13 timed (+ dangling in-lap) | 14 timed (+ dangling) |
| Points | 1305 @ 1 Hz | 1342 @ 1 Hz |
| Accuracy | median 3.7 m, max 17 m | median 2.0 m, max 10 m |
| Defects | 5–11 s **total delivery dropouts** at L2→3, L4→5, L5→6 boundaries and mid-L9 | None on track (only stationary pit pauses). Per-lap max speeds fossilized wrong by a pre-overhaul bug |
| Ground truth | **Circuit transponder times for all 13 laps** (table in Phase 0 spec) | Stored lap times (clean data; replay must not change them) |

Data files live in `bench/data/` (gitignored — personal session data).

## The re-timer post-mortem (the lesson that shapes everything here)

A Doppler-based crossing re-timer was built, synthetically validated, shipped
to a build — and then **falsified by real data**: projecting from the last
good fix at its constant speed across a 5–11 s dropout worsened lap error
from 0.383 s to 0.462 s mean (1.149 → 1.427 s max), because the car
accelerates from ~101 to ~150 km/h through exactly that zone. It was removed.

Consequences baked into this project:

- **Bench before build.** Everything is validated offline against the real
  sessions before any app code changes. Synthetic tests alone are not
  evidence (the re-timer passed them).
- **Never extrapolate across silence.** During dropouts the filter predicts
  internally but emits no virtual samples and asserts no crossings; naive
  interpolation + the `≈` flag remain the dropout behavior until IMU exists.
- **Explicit kill criteria**, agreed before work starts.

## Standing product rules (from Kevin, non-negotiable)

- Clean and minimal code. Prefer deleting complexity over adding
  compensating layers. No dependencies for things ~150 lines can do.
- Honest data over clever guesses. A gap/flag beats a wrong line/time.
- Never render or assert data that wasn't measured.
- Raw stored telemetry is never modified (filter output is derived, used
  live, never written back).
- Explain and get approval before code changes.

## Decision log

| Decision | Rationale |
| --- | --- |
| Linear KF, constant-velocity model, **no EKF/Jacobians** | Keep heading out of the state; convert Doppler speed+heading to velocity components *before* the update → measurements stay linear. Cornering is process noise, not model structure. |
| Two decoupled per-axis 2-state filters instead of one 4-state | Isotropic model + circular GPS accuracy decouple east/north exactly. ~40 lines of closed-form arithmetic per axis; no matrix library. |
| No external Kalman library | At 2 states the library's glue exceeds the filter. JS options are unmaintained. |
| Three-arm bench: naive vs fixed-gain (alpha-beta) vs adaptive KF | A constant-gain KF *is* a complementary filter; whether adaptive gain earns its complexity is an empirical question. Ship the simplest arm that wins. |
| Filter feeds **detection only** in Phase 1 | Display is solved and approved; storage stays raw; smallest possible blast radius. |
| Doppler velocity used as a *bounded per-sample correction*, never a projection engine | Re-timer post-mortem. |
| Phase 2 prefers the RaceBox IMU over phone CoreMotion | Same packet/clock as its GNSS, rigidly mounted, per-sample accuracies — avoids the phone's alignment/clock/mount problems entirely. Phone IMU remains the fallback path for phone-only users. |

## Related repo context

- `telemetry/filters.ts` — capture validation (accuracy/jump/monotonic). Unchanged by this project.
- `telemetry/detection.ts` — segment-intersection crossing detection + quality assessment. Phase 1 changes only *which positions* it receives.
- `telemetry/session-runtime.ts` — orchestration; owns the unified session clock; Phase 1 integration point.
- `telemetry/sources/` — source abstraction (phone GPS / RaceBox BLE @ 25 Hz, `EXTERNAL_GPS_ENABLED` in `constants/featureFlags.ts`, off by default). RaceBox samples carry `speedAccuracyMps`, `headingAccuracyDeg`, and on-board IMU (`gForceX/Y/Z`, `rotationRate*`) in `ExtendedTelemetrySample`.
- Tests: jest-expo (`npm test`), colocated `__tests__/` folders — Phase 0 unit tests follow this convention.

## Glossary

- **Doppler velocity** — speed/course measured by the GNSS chip from carrier
  frequency shift. Noise ~0.1–0.5 m/s; immune to the position multipath that
  displaces fixes. Independent information, not derived from positions.
- **CV model** — constant-velocity motion model; deviations (accel/braking/
  cornering) are absorbed as process noise.
- **Process noise (σa)** — how much acceleration the model tolerates before
  distrusting its own prediction. The main tuning knob.
- **Innovation** — measurement minus prediction. **Gate** — reject a
  measurement whose innovation is implausible given current uncertainty.
- **Alpha-beta filter** — a KF with hand-fixed constant gains; equivalently a
  complementary filter. The "is adaptivity worth it" control arm.
- **ENU frame** — local East/North metric plane anchored near the track;
  lat/lng are projected in, estimates are projected back out.
