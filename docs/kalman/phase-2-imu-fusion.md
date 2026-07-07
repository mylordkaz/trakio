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
- Phone path: a capture module sampling `DeviceMotion` at 50 Hz into a
  session-scoped buffer, exported alongside. Foreground-only, recording
  screen only, feature-flagged.
- Deliverable: ≥1 real Tsukuba session with synchronized GPS+IMU export —
  ideally one that includes a natural gantry dropout.

### 2b — Bench (the decisive step, no app changes)

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
