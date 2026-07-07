# Phase 0 — Filter Module + Offline Bench

**Scope guarantee: zero app behavior changes.** Phase 0 produces (a) the
filter as a pure module, (b) an offline bench that replays the two real
benchmark sessions through three competing estimation arms, (c) a results
report against hard acceptance criteria. The app never imports the filter in
this phase.

## 1. Goal

Answer one question with evidence: **does state estimation measurably improve
lap timing on real trakio data, and if so, does it need adaptive (Kalman)
gains or do fixed gains suffice?**

Possible outcomes, all acceptable:

1. Adaptive KF wins → proceed to Phase 1 with the KF.
2. Fixed-gain (alpha-beta) matches the KF → proceed to Phase 1 with the
   simpler arm.
3. Neither beats naive beyond noise → **ship nothing**, keep the bench as a
   regression harness, reorder the roadmap to Phase 2 (IMU). This outcome is
   explicitly a success of the process, not a failure.

## 2. Non-goals

- Fixing the ±1.1 s dropout laps (impossible without IMU; see README).
- Changing display, storage, schema, UI, or any shipped behavior.
- Emitting predicted/virtual samples across GPS silence — banned.
- EKF, heading-in-state, matrix libraries, new dependencies.

## 3. The three arms

Every arm is a drop-in position provider with the same interface: it consumes
accepted samples in order and yields, per sample, the position handed to
crossing detection. Everything downstream (detection, quality flags, lap
assembly) is the real production code, replayed identically per arm.

| Arm | What it does | Question it answers |
| --- | --- | --- |
| **A — naive** (baseline) | Pass raw accepted positions through unchanged. Exactly what ships today. | The bar to beat. |
| **B — alpha-beta** | Fixed-gain position+velocity tracker (constant-gain steady-state KF). One pair of gains, no covariance. | Is *any* state tracking useful, and are fixed gains enough? |
| **C — adaptive KF** | Full per-axis Kalman with tracked covariance, accuracy-weighted updates, innovation gating, dropout-aware uncertainty growth. | Does adaptivity (varying trust) earn its extra ~60 lines? |

## 4. Filter design (arm C; arm B is the same skeleton with constant gains)

### 4.1 Frame

Local ENU metric plane anchored at the first accepted fix
(`lat0`, `lng0`):

```
x = (lng − lng0) · cos(lat0) · 111320      // east, meters
y = (lat − lat0) · 111320                  // north, meters
```

Inverse mapping returns filtered estimates to lat/lng for detection. Track
scale (~2 km) makes projection error negligible. Same constants already used
in `utils/displayLine.ts`.

### 4.2 State and decoupling

Per axis (east and north independently): state `[p, v]` (position, velocity),
covariance `[[Ppp, Ppv], [Ppv, Pvv]]`. The two axes decouple exactly because
the motion model is isotropic and GPS accuracy is circular. Total filter =
two identical scalar-arithmetic filters. No matrix types anywhere.

### 4.3 Predict (per accepted sample, dt = seconds since previous update)

Discrete white-noise-acceleration model, tuning knob `σa` (m/s²):

```
p   ← p + v·dt
v   ← v
Ppp ← Ppp + 2·Ppv·dt + Pvv·dt² + σa²·dt⁴/4
Ppv ← Ppv + Pvv·dt            + σa²·dt³/2
Pvv ← Pvv                     + σa²·dt²
```

### 4.4 Position update (measurement z_p, variance R_p)

```
R_p = (kR · max(accuracyM, 3))²          // reported accuracy treated as ~1σ, scale kR tunable
y   = z_p − p
S   = Ppp + R_p
gate: if y² / S > G²  → skip update (count it), keep predicting
Kp  = Ppp / S ;  Kv = Ppv / S
p  += Kp·y ;  v += Kv·y
Ppp ← (1−Kp)·Ppp
Ppv ← (1−Kp)·Ppv
Pvv ← Pvv − Kv·Ppv_old                    // uses Ppv from BEFORE this update
```

### 4.5 Velocity update (from Doppler)

Convert speed+heading to components first (heading = degrees clockwise from
north): `zvx = speed·sin(θ)`, `zvy = speed·cos(θ)`.

```
R_v: source-dependent —
     phone:   (0.7 m/s)² fixed (no per-sample speed accuracy from expo-location)
     racebox: (speedAccuracyMps)² per sample when present
y   = z_v − v
S   = Pvv + R_v
Kp  = Ppv / S ;  Kv = Pvv / S
p  += Kp·y ;  v += Kv·y
Ppp ← Ppp − Kp·Ppv_old
Ppv ← (1−Kv)·Ppv
Pvv ← (1−Kv)·Pvv
```

Skip the velocity update when `headingDeg === null` or `speedMps < 1.5 m/s`
(course is undefined/noisy near standstill). Optional, bench-evaluated:
zero-velocity update (z_v = 0, small R) when `speedMps < 0.5 m/s` to pin the
parked car.

### 4.6 Dropouts, reset, hygiene

- No measurements → predict only; P grows quadratically — that is the honest
  representation of not knowing. **No virtual samples are emitted.**
- If dt since last update > `resetGapS` (default 10 s): re-initialize at the
  next fix (position = fix, velocity = Doppler or 0, P large). Prediction
  across such spans is meaningless; an honest re-lock beats a stale prior.
- Numerical hygiene: floor variances at ε (1e-4), single stored Ppv keeps P
  symmetric by construction.

### 4.7 Initialization

First accepted fix: `p = fix`, `v = Doppler components` (or 0 if unavailable),
`Ppp = (2·accuracyM)²`, `Pvv = (5 m/s)²` (or `(20 m/s)²` when v unknown).

### 4.8 Arm B (alpha-beta) specifics

Same predict step for `p`; correction with constants:
`p += α·y`, `v += (β/dt)·y` on the position innovation only (velocity
measurement folded in with a second fixed gain, bench-evaluated with and
without). Start α = 0.5, β = α²/(2−α) ≈ 0.167 (critically damped), tune.
Same reset-on-gap rule. No covariance, no gating — the arm exists to measure
what those are worth.

### 4.9 Starting parameters (all bench-tuned)

| Param | Start | Range | Meaning |
| --- | --- | --- | --- |
| σa | 3.0 m/s² | 1–6 | Accel the CV model absorbs. Too low → lags corners (apex shift!); too high → filters nothing |
| kR | 1.0 | 0.5–2 | Trust scale on reported accuracy |
| R_v (phone) | (0.7 m/s)² | 0.3–1.5 | Doppler trust |
| G (gate) | 5σ | 3–8 | Innovation rejection threshold |
| resetGapS | 10 s | 5–20 | Give-up-and-relock threshold |

Tuning is a grid sweep in the bench, selected on July-clean + April metrics,
**never** on the dropout laps (no fitting to the thing we claim not to fix).

## 5. Deliverables and layout

```
telemetry/kalman.ts               the filter (arm C) + alpha-beta variant (arm B).
                                  Pure module; app does NOT import it in Phase 0.
telemetry/__tests__/kalman.test.ts   unit tests (jest-expo, npm test)
bench/
  run.ts                          CLI: npx tsx bench/run.ts  → full report
  arms.ts                         the three position-provider wrappers
  replay.ts                       exported-JSON → samples → runtime replay (mock recorder)
  synthetic.ts                    scenario generators (§7)
  render.ts                       SVG lap-grid comparisons (naive vs filtered traces)
  data/                           gitignored; drop exported session JSONs here
```

The replay and SVG-render machinery already exists in prototype form from the
July/April analyses; `bench/` makes it permanent and repeatable.

## 6. Metrics and acceptance criteria (real data)

Replays feed the **production** runtime/detection code; only the position
provider differs per arm. Ground truth for July: circuit transponder times.

| # | Test | Data | Criterion for arms B/C |
| --- | --- | --- | --- |
| 1 | History stability | April, 14 laps | Every replayed lap within **±30 ms** of stored time; 14/14 laps detected; zero `≈` flags |
| 2 | Clean-lap accuracy | July L1, L7–L13 vs transponder | Mean \|err\| ≤ naive's on the same laps; no lap worse than naive by > 20 ms |
| 3 | Dropout laps | July L2–L6 vs transponder | Mean \|err\| ≤ **0.383 s** (naive's score). Expected ≈ equal; must not regress |
| 4 | Flag correctness | July | `≈` on exactly L2–L6; April none |
| 5 | Sector sanity | Both | Sector splits within ±30 ms of stored on clean laps |
| 6 | Win condition | #2 | A shipping case exists only if mean clean-lap \|err\| improves by ≥ **20 ms** or synthetic robustness (§7) shows a clear win naive lacks |

Transponder ground truth (July session):

| Lap | Official | Lap | Official |
| --- | --- | --- | --- |
| 1 | 1:19.195 | 8 | 1:30.612 |
| 2 | 1:18.108 | 9 | 1:24.875 |
| 3 | 1:17.969 | 10 | 1:26.531 |
| 4 | 1:18.821 | 11 | 1:24.975 |
| 5 | 1:18.148 | 12 | 1:25.134 |
| 6 | 1:18.764 | 13 | 1:24.017 |
| 7 | 1:21.114 | | |

Reference: naive vs transponder = 0.383 s mean / 1.149 s max overall;
clean laps ±0.08 s; replay reproduces stored times within ±2 ms (ISO
timestamp truncation noise — the tolerance floor for everything above).

## 7. Synthetic suite (exact ground truth, secondary evidence)

Generators produce known trajectories; pass criteria are exact:

1. **Displaced fix**: clean 1 Hz stream, one fix displaced 25 m with honest
   accuracy. C must gate or absorb it (crossing time unchanged > 50 ms level);
   record what B and A do (expected: worse).
2. **Short dropout (2 s) over a crossing**: constant 40 m/s → all arms within
   50 ms of truth; accelerating 28→42 m/s → report errors per arm (C expected
   best, none required to pass — documents the limit).
3. **Long blackout (11 s)**: C must emit no crossing from prediction, grow P,
   reset cleanly at re-lock; downstream behavior identical to naive + flag.
4. **Parked on line**: 5 min of 0-speed jitter — no drift, no phantom
   crossings (speed gate already covers this; verify the filter doesn't
   defeat it).
5. **Hard braking (1.0 g) into a corner at 1 Hz**: C's position lag at apex
   < 2 m with tuned σa (this is the σa tuning stress test).
6. **25 Hz input** (synthetic RaceBox cadence): numerically stable, output
   sane, per-sample cost trivial.

## 8. Report format

`bench/run.ts` prints one markdown report: per-arm lap tables (April deltas,
July vs transponder), the acceptance checklist with pass/fail, synthetic
results, chosen parameters, and paths to rendered SVG comparisons. That
report — not opinion — is the Phase 1 go/no-go input, reviewed by Kevin.

## 9. Kill criterion

If neither B nor C satisfies criterion #6, Phase 1 does not happen. The bench
and `telemetry/kalman.ts` remain in the repo as a regression harness and as
the starting skeleton for Phase 2, and the README status table is updated to
record the outcome and the numbers.

## 10. Estimated size

`kalman.ts` ~150 lines; bench ~300 lines total (mostly consolidation of the
existing prototype replay/render scripts); unit tests ~100 lines. Zero new
dependencies.
