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
groupPointsIntoLapRuns`, used by session detail). Render-time, read-only:
quarantined fixes are merged into each lap run in time order, bucketed by
the stored crossing times — so a fix rejected during the crossing second
lands in the lap it belongs to, on the correct side of the line, and can
never displace a clip. The display filters (15 m accuracy cutoff, despike,
hole split) still gate quality. Applies to every stored session that has
quarantine data, past and future.

**B — capture cascade re-anchor** (`telemetry/session-runtime.ts`, flag
`JUMP_REANCHOR_ENABLED`), scoped to short cascades (anchor gap
≤ `recoveryMinGapMs`, 4 s). A second consecutive `impossible_jump` that is
consistent with the previously *rejected* sample proves the accepted
anchor was displaced: accept the sample, re-anchor there, and run
detection on the validated chain — the anchor chord, just proven
impossible, is never timed. Across a hole-spanning gap that proof does not
hold (the rejection may be an honest allowance shortfall) and the chain
would be entirely post-hole, so the re-anchor does not fire at all:
rejection continues until a sample is *consistent* with the anchor, and
crossing recovery times that uncontradicted chord, flagged `≈` — the
behavior the acceptance table validated before the re-anchor existed. The
extra rejected fixes stay in quarantine, which the display merges anyway.
The first jump of a cascade stays rejected by design — at that moment a
displaced anchor and a genuine outlier are indistinguishable. Both regimes
are unit-tested (`telemetry/__tests__/session-runtime-reanchor.test.ts`)
and the masked acceptance table reproduces to the millisecond.

**C — laps clipped at the stored crossing time** (`groupPointsIntoLapRuns`).
Each lap's line is clipped at its boundaries' `laps.startedAt` — the
crossing moment timing froze at capture. The clip point is the recorded
path's position (accepted + quarantined timeline) interpolated at that
time, so the line changes laps exactly where the lap time says it did —
including boundaries the detector timed on a re-anchored chain or a
recovered hole-spanning chord. Display consumes timing's output; it never
re-derives crossing geometry. Consecutive laps share the clip point (no
gap, no overshoot, overlap impossible); a boundary without a crossing time
(pit entry/exit, unfinished data) gets no clip — a gap, never an overlap.
Clip points are structural, not measured fixes: `accuracyM` is null so the
display accuracy filter can never delete a lap's endpoint even when the
boundary fix itself was degraded (capture accepts up to 40 m; display
draws up to 15 m).

Two earlier designs died in review: borrowing the neighbor lap's raw fix
(up to ~30 m past the line at crossing speed — doubled every lap through
the S/F zone, caught on device) and intersecting the accepted boundary
segment with the line geometrically (correct until a re-anchored boundary
made timing and display disagree about which segment crossed). The lesson
both times: assert the requirement, not the mechanism.

## Crossing recovery (detection side, same thread)

Hole-spanning segments (> 4 s) that cross the timing line's extension
within the measured margin (±1.25 gate lengths; real off-line traffic
clusters at 2.6+) recover the crossing, flagged `≈` via the degraded
path. `bench/recovery-acceptance.ts`: all real sessions byte-stable with
the flag on and off; masked boundaries 0/14 laps lost at 8 s and 11 s
masks (previously up to 14/14); pit lane, gate-edge, and parked-jitter
synthetics all correct.

## Validation (`bench/continuity-validation.ts`, real session replay)

Confirmed on device (TestFlight build, 2026-07-20): all 13 laps render as
continuous lines starting and ending on the start/finish line, no overlap.

- **A**: 13/13 laps single-segment (before: laps 1 and 2 had holes).
- **B**: merged-stream replay (accepted + quarantined, time-ordered —
  simulates original delivery). Re-anchor off reproduces the device run
  exactly: 1405 accepted, 5.0 s cascade holes, lap times within 1 ms of
  stored. Re-anchor on: 1410 accepted, worst hole 2.0 s, lap times still
  within 1 ms — timing untouched, as required.
- **C**: every lap's rendered line starts and ends within 0.04 m of the
  S/F line (13/13 July laps, 14/14 April laps — the 4 cm is the stored
  crossing time's millisecond truncation at ~50 m/s, i.e. display is bound
  to timing's own precision); consecutive laps share the exact clip point
  at all 13 boundaries.

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
