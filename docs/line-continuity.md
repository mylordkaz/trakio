# Line continuity — never lose a lap, never break the line

The product goal: a clean, continuous line for every lap from phone GPS
alone. Invariant (permanent): **lap timing and line rendering are
decoupled** — timing is computed once at capture from validated fixes and
frozen; the display line is derived read-only at render time. No display
work may influence a lap time.

## What the data showed (Tsukuba 2026-07-19, 13 laps)

Both mid-session line holes were **self-inflicted**, not GPS dropouts. The
capture quarantine (`rejected_gps_points`, migration v15, export v3) proved
the phone delivered 4 m-accuracy fixes straight through both holes — the
jump filter rejected them because one displaced-but-accepted fix had become
the anchor. Chain analysis: anchor→next implies 138/188 km/h steps versus
reported 51/78 km/h, while the rejected chain's steps match reported speeds
— the rejected fixes were the true path.

## The three fixes

**A — display merges the quarantine** (`utils/displayLine.ts
mergeQuarantinedPoints`, used by session detail). Render-time, read-only:
quarantined fixes are merged into the accepted stream by time, inheriting
the lap of the preceding accepted point; the display filters (15 m accuracy
cutoff, despike, hole split) still gate quality. Applies to every stored
session that has quarantine data, past and future.

**B — capture cascade re-anchor** (`telemetry/session-runtime.ts`, flag
`JUMP_REANCHOR_ENABLED`). A second consecutive `impossible_jump` that is
consistent with the previously *rejected* sample means the rejected chain
is the true path and the accepted anchor was displaced: accept it and
re-anchor there. The first jump of a cascade stays rejected by design — at
that moment a displaced anchor and a genuine outlier are indistinguishable.

**C — laps clipped at the crossing line** (`groupPointsIntoLapRuns`).
Each lap's line is clipped at the start/finish line: the stitch point on
each side is the interpolated crossing of the boundary segment with the
line, computed with the detector's own geometry
(`segmentTimingLineFraction`). Every lap starts and ends exactly at its
own crossing position; consecutive laps share that exact point, so they
meet with no gap and cannot overlap. Where the boundary segment does not
cross the line (pit entry/exit, degenerate data) that side gets no stitch
— a gap, never an overlap. The first version borrowed the neighbor lap's
raw fix instead; at ~110 km/h and 1 Hz that fix sits up to ~30 m past the
line, doubling every lap's line through the S/F zone — caught on device
(2026-07-19) because the bench asserted the mechanism ("one stitch point
per side") instead of the requirement ("ends on the line").

## Crossing recovery (detection side, same thread)

Hole-spanning segments (> 4 s) that cross the timing line's extension
within the measured margin (±1.25 gate lengths; real off-line traffic
clusters at 2.6+) recover the crossing, flagged `≈` via the degraded
path. `bench/recovery-acceptance.ts`: all real sessions byte-stable with
the flag on and off; masked boundaries 0/14 laps lost at 8 s and 11 s
masks (previously up to 14/14); pit lane, gate-edge, and parked-jitter
synthetics all correct.

## Validation (`bench/continuity-validation.ts`, real session replay)

- **A**: 13/13 laps single-segment (before: laps 1 and 2 had holes).
- **B**: merged-stream replay (accepted + quarantined, time-ordered —
  simulates original delivery). Re-anchor off reproduces the device run
  exactly: 1405 accepted, 5.0 s cascade holes, lap times within 1 ms of
  stored. Re-anchor on: 1410 accepted, worst hole 2.0 s, lap times still
  within 1 ms — timing untouched, as required.
- **C**: every lap's rendered line starts and ends 0.00 m from the S/F
  line (13/13 July laps, 14/14 April laps); consecutive laps share the
  exact clip point at all 13 boundaries.

Bench note: `bench/replay.ts`'s mock recorder must implement every
recorder method the runtime calls — a missing `recordRejectedSample`
silently threw inside the rejection branch and masked Fix B in replays
until the error-swallowing `catch` was removed. Bench errors now crash
loudly.

## What remains

True-silence holes (nothing delivered at all — e.g. the gantry) are not
bridgeable with real data; they stay as honest splits in the line. The
first fix of each cascade stays quarantined; the display merge renders it
anyway if it passes the display filters.
