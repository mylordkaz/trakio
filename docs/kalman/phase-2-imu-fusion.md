# Phase 2 — IMU Fusion (the actual dropout fix)

**Status: future.** This spec captures the design thinking while it is fresh;
it is expected to be revised when Phase 2 starts. Phases 0/1 are prerequisites
only in the sense that the filter skeleton and the bench exist — Phase 2 is
justified even if Phase 1 shipped nothing (see Phase 0 kill criterion).

## 1. Goal

Recover honest timing through total GPS silence. During the 5–11 s dropouts,
an IMU keeps measuring; fusing its acceleration lets the state estimate keep
*curving and accelerating* with the car instead of freezing at constant
velocity. Target: dropout-boundary lap error from today's **±1.0–1.1 s
(flagged ≈)** down to **≤ 0.3–0.4 s**, with the flag retained but the number
honest. Stretch: ≤ 0.25 s.

Why this is credible where GPS-only was not: the re-timer failed because the
car accelerated 101→150 km/h during the silence and nothing measured it. An
IMU measures exactly that, at 25–100 Hz, throughout.

Phase 0's kill finding strengthens this argument rather than weakening it:
GPS-only filtering failed because the constant-velocity model *guesses*
acceleration and therefore lags corners, displacing the path laterally into
the finite timing gates (lost laps at gate edges). An IMU-driven predict
replaces the guess with a measurement, removing the lag at its source.
**Hard requirement:** any Phase 2 estimator must pass `bench/synthetic.ts`
(the gate-edge slip reproduction) and the full Phase 0 §6 checklist —
including lap-count check #0 — before it is allowed anywhere near detection.

## 2. Two hardware paths — RaceBox first

### Path A (preferred): RaceBox on-board IMU

The RaceBox integration (`telemetry/sources/racebox/`) already delivers, in
the **same packet and on the same clock** as its GNSS solution:
`gForceX/Y/Z` and `rotationRateX/Y/Z` (`ExtendedTelemetrySample`), at 25 Hz.

This eliminates the three hardest phone-IMU problems at once:

| Problem | Phone | RaceBox |
| --- | --- | --- |
| Clock alignment IMU↔GNSS | Two clock domains, must align | Same packet — none |
| Mounting/orientation | Arbitrary, can shift in a corner | Device mounted rigidly, documented axes |
| Sensor quality/calibration | Consumer, uncalibrated | Racing device, factory-characterized |

Remaining work on this path: axis convention mapping (device frame → car
frame → ENU via GPS course), gravity separation on gForce, and yaw alignment
(below). Caveat to verify in 2a: whether the RaceBox's own GNSS even *has*
the gantry dropout — its antenna and receiver may simply hold fix where the
phone loses it, which would shrink the problem to phone-only users.

### Path B: phone CoreMotion (for phone-only users)

`expo-sensors` `DeviceMotion` provides OS-fused attitude and
gravity-separated user acceleration at up to ~100 Hz. The OS already solved
orientation fusion — we consume `userAcceleration` rotated by `attitude`,
never touching gyro integration ourselves.

Phone-specific challenges (why this is Path B):

- **Yaw reference**: attitude yaw is arbitrary or magnetic; magnetometers are
  unreliable inside cars. Solution: estimate the yaw offset continuously by
  comparing IMU-frame acceleration direction with GPS course while moving —
  a slowly-adapting scalar, converges in seconds of driving.
- **Mount rigidity**: a phone loose in a cupholder invalidates everything.
  Assume rigid mount; document it as a requirement.
- **Clock alignment**: sensor timestamps vs GPS `recordedAt` need a measured
  offset (estimate during clean GPS periods).
- **Bias**: accelerometer bias drifts; estimate it during known-stationary
  periods (pit, pre-session — the checklist moment is ideal) and optionally
  as slow filter states later. Bias of 0.05 m/s² over 11 s ≈ 3 m position
  error — acceptable; 0.5 m/s² ≈ 30 m — not. Bias handling is the make-or-
  break of Path B.

## 3. Filter architecture — still linear

Same per-axis 2-state filter as Phase 0, with one addition: measured
acceleration enters the **predict** step as a control input (classical
LKF-with-control, still no EKF/Jacobians because orientation is resolved
*before* the filter by OS attitude / device convention + yaw offset):

```
predict at IMU rate (25–50 Hz), a = measured accel in ENU:
  p ← p + v·dt + ½·a·dt²
  v ← v + a·dt
  P ← as Phase 0, with σa now representing accel MEASUREMENT noise + bias
      uncertainty (much smaller than the motion-model noise it replaces)

update at GNSS rate (1 Hz phone / 25 Hz RaceBox): position + Doppler velocity,
identical to Phase 0.
```

During GPS silence the predict keeps integrating real measurements — that is
the entire trick. Uncertainty still grows (bias, noise), just ~an order of
magnitude slower than the blind CV model.

Crossing detection: unchanged geometry, but during an IMU-bridged gap the
filter can now emit its per-predict positions to detection, because they are
**measurement-backed**, not guessed. The "never extrapolate across silence"
rule is preserved in spirit: silence no longer exists — the IMU is still
talking. Bridged-gap crossings keep the `≈` flag until validation proves they
deserve better (a possible later downgrade of the flag to a tighter
criterion).

## 4. Sub-phases (same discipline as 0/1)

### 2a — Capture (small app change, no behavior change)

Record raw IMU streams alongside GPS during real sessions and include them in
the JSON export. Without captured real data there is nothing honest to tune
against.

- RaceBox path: fields already arrive in `ExtendedTelemetrySample`; persist
  the extended fields for the session export (dev-gated if size is a
  concern; ~25 Hz × 30 min ≈ 45k rows — likely a separate export payload
  rather than `gps_points` rows).
- Phone path: **built 2026-07-08** (branch `feat/imu-capture`) —
  `telemetry/imu-capture.ts` samples `DeviceMotion` at ~50 Hz behind
  `IMU_CAPTURE_ENABLED` (off by default) into the `imu_samples` table
  (migration v14, raw as-delivered values, session-scoped, cascade delete),
  batched inserts every ~2 s, best-effort by design (any failure degrades to
  "no IMU data", never to a recording error). Export becomes
  `trakio-session-export` v2 with an `imuSamples` payload (values rounded to
  6 decimals for size; far below sensor noise). RaceBox path deferred until
  hardware is available for testing (`EXTERNAL_GPS_ENABLED` remains off).
- Deliverable: ≥1 real Tsukuba session with synchronized GPS+IMU export —
  ideally one that includes a natural gantry dropout. Battery cost of the
  50 Hz capture to be observed on that session and recorded here.

### 2b — Bench (the decisive step, no app changes)

**Progress (2026-07-08, branch `feat/imu-fusion-bench`):** the machinery is
built and the fusion prototype passes all mechanics checks. Waiting on real
captured data (street drive first, then track).

- `bench/imu-quality.ts` — stream-quality report for any capture (rate,
  jitter, gaps, field coverage, stationary-window accelerometer bias).
- `bench/mask.ts` — masked-GPS naive baseline, locked on the April session
  (mean boundary-lap |err|, by mask length and crossing phase):
  3 s ≈ 0.05–0.07 s; 5 s ≈ 0.16 s; 8 s ≈ 0.36–0.53 s with laps starting to
  vanish; **11 s = every lap lost at all 14 boundaries, both phases** (July's
  real 11 s dropouts survived only through lucky hole geometry). Fusion's
  bar, unchanged: ≤0.15 s at 5 s, ≤0.3 s at 11 s, zero lost laps.
- `bench/fusion.ts` — the fusion prototype (accel-as-control predict at IMU
  rate, GPS position+Doppler updates, W3C attitude rotation, online yaw
  alignment from GPS-vs-IMU Δv with honest CV cold start).
- `bench/fusion-synthetic.ts` — mechanics validation, all passing: 11 s
  accelerating mask 1 ms vs naive 1058 ms; Phase 0 gate-edge scene kept with
  0 ms err (GPS-only lost it); corner bridged at 15 ms across an 8 s mask
  where naive loses the lap; yaw converges to 0.0° from a 37° offset; bias
  budget measured 50→6 ms, 100→27 ms, 200→109 ms, 500 mm/s²→lap lost.
  Per the Phase 0 lesson these gate development only — the shipping verdict
  belongs to real captured data below.

Extend `bench/` to replay GPS+IMU. Two validation classes:

1. **Masked-GPS reconstruction (the key trick)**: take a *clean* captured
   session, artificially delete 5–11 s windows of GPS from the replay while
   keeping the IMU stream, and compare the filter's bridged trajectory and
   crossing times against the **hidden real GPS** — exact ground truth for
   precisely the failure we care about, manufacturable at will from any
   clean session, at any point on track.
2. Natural-dropout sessions vs transponder times, when captured.

Acceptance: masked-crossing time error ≤ 0.3 s at 11 s masks (≤ 0.15 s at
5 s); no regression on unmasked laps (Phase 0 criteria re-run); April/July
GPS-only bench still green with the filter in GPS-only mode.

Kill: if bias/vibration reality keeps masked-reconstruction errors near the
naive baseline, stop at 2b and document. (Path A failing would be surprising;
Path B failing is a real possibility.)

### 2c — Integration

Mirror of Phase 1: one integration point, feature flag
(`IMU_FUSION_ENABLED`), rollback by flag, device validation including a
transponder day. Battery cost measured in 2a and reported before enabling by
default.

## 5. Explicit non-goals

- Background recording (separate roadmap item; IMU capture is foreground,
  same as GPS).
- Magnetometer dependence (car interference).
- Gyro-based attitude estimation of our own (OS/device provides attitude).
- Storing fused output (raw-only storage rule holds; IMU raw capture in 2a
  is raw sensor data, not filter output).

## 6. Open questions to resolve in 2a

- Does the RaceBox hold GNSS fix through the Tsukuba gantry? (If yes, Path A
  users don't need bridging at all — the feature narrows to phone users.)
- Real RaceBox IMU noise/bias figures vs datasheet.
- expo-sensors `DeviceMotion` actual delivered rate and timestamp behavior on
  the target iPhone while `expo-keep-awake` is active.
- Export size/format for high-rate streams (separate file vs inline JSON).
- Battery impact of 50 Hz DeviceMotion for a 30-min session.
