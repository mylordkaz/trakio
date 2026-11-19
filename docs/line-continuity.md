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

**A — quarantine bridges holes** (`utils/displayLine.ts`). Render-time,
read-only, and governed by one invariant that ends the
quarantine-vs-rendering bug class structurally: **the trusted stream
(accepted points + clips) renders exactly as if quarantine did not exist —
its segmentation is computed first and is immutable — and quarantined
fixes participate only as hole bridges.** A hole in the trusted stream is
closed exactly when a complete chain of quarantined fixes connects its
edges with every hop inside the same time/distance guards; anything else
about a quarantined point — isolated jumps, garbage islands, fixes in
continuous regions — cannot affect the rendered line at all. Bucketing by
the stored crossing times decides which lap a quarantined fix may bridge
in. Applies to every stored session that has quarantine data, past and
future.

**B — capture cascade re-anchor** (`telemetry/session-runtime.ts`, flag
`JUMP_REANCHOR_ENABLED`), scoped to short cascades (anchor gap
≤ `recoveryMinGapMs`, 4 s). A second consecutive `impossible_jump` that is
consistent with the previously *rejected* sample proves the accepted
anchor was displaced: accept the sample, re-anchor there, and run
detection on the validated chain — the anchor chord, just proven
impossible, is never timed. Across a hole-spanning gap that proof does not
hold (the rejection may be an honest allowance shortfall) and the chain
would be entirely post-hole, so the re-anchor does not fire: rejection
continues until a sample is *consistent* with the anchor, and crossing
recovery times that uncontradicted chord, flagged `≈` — the behavior the
acceptance table validated before the re-anchor existed. The extra
rejected fixes stay in quarantine, which the display merges anyway.

The direct allowance is not *guaranteed* to catch up, though — it grows
with reported speed while displacement integrates actual speed — and
without an escape one stale anchor could reject every remaining sample of
the session. The **liveness fallback** bounds this: once the
*continuously chain-valid* impossible-jump streak has lasted longer than
`recoveryMinGapMs` while the anchor kept rejecting, capture re-anchors
onto the chain with detection suppressed for that one step. The streak
timer counts only proven self-consistency — any other rejection reason
clears it, and an inconsistent hop restarts it at the sample that may
head a new chain — so stale unrelated rejections can never pre-age the
bound. Nothing across the ambiguous span is timed — an in-span crossing
is honestly missed, never guessed — and the anchor-consistent recovery
path always wins first when it is reachable.
The first jump of a cascade stays rejected by design — at that moment a
displaced anchor and a genuine outlier are indistinguishable. Both regimes
are unit-tested (`telemetry/__tests__/session-runtime-reanchor.test.ts`)
and the masked acceptance table reproduces to the millisecond.

**C — laps clipped at the stored crossing position**
(`groupPointsIntoLapRuns`). Detection interpolates the crossing's
position on the exact segment it timed — accepted, re-anchored chain, or
recovered chord — and the runtime freezes it into
`laps.started_latitude/started_longitude` (migration v16, export v4).
The display clip *is* that stored point: display consumes timing's
record and never re-derives crossing geometry, so the line changes laps
exactly where the lap time says it did, by construction. The stored pair
is atomic (used only when both halves are finite); laps recorded before
v16 fall back to interpolating the *accepted* path at `laps.startedAt` —
their boundaries were timed on accepted segments, so the fallback walks
the same geometry. Consecutive laps share the clip point (no gap, no
overshoot, overlap impossible); a boundary without a lap start (pit
entry/exit, unfinished data) gets no clip — a gap, never an overlap.
Clip points are structural, not measured fixes: `accuracyM` is null so
the display accuracy filter can never delete a lap's endpoint even when
the boundary fix itself was degraded (capture accepts up to 40 m;
display draws up to 15 m), and because clips are part of the trusted
stream, no quarantined point can displace, detach, or split them (see
Fix A's invariant). Migration v16 is restart-safe (column-guarded ALTERs
— `user_version` is written after `up()` returns, so a crash in between
must not brick the retry).

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

## Hole bridging from the phone IMU (2026-11, Motegi)

Motegi's road course passes under the oval. On every lap the phone's fixes
degrade from ~600 m before the Sector 1 line to ~230 m after it: accuracy
climbs through 20–40 m (accepted, hidden by the 15 m display filter) to
40–85 m (quarantined), then snaps back with a ~100 m jump. The trusted line
has a 31 s / ~850 m hole there on every lap, with the sector line inside it.

Measurements keep flowing through such a hole: the phone's yaw, two ways
(the OS-fused attitude yaw `rotation_alpha`, and the raw gyro `rotation_rate`
projected on the session's median gravity direction), and the Doppler speed
on the degraded and quarantined fixes. `utils/holeBridge.ts` integrates
heading from the yaw and distance from the speed, closes the path onto the
trusted fixes on both sides, and the session map draws the result in the
same amber and width as the measured line, with no legend entry. Timing, storage and the
export never see it; it is recomputed on every open of the session.

Clock parameters are measured on each session's own trusted fixes, from
chords between fixes ~1 s apart: per heading source its sign and clock
offset (best r² over a −1.5…+0.5 s sweep), and the lag between the reported
speed and the position it describes (0.8 s on this iPhone). Anchor headings
are fitted over the four fixes on either side, so a single noisy course never
steers the bridge. The closure residual is spread linearly along the bridge;
scaling or rotating the path instead was measured worse.

Why two heading sources: expo-sensors requests the magnetic-north attitude
frame on iOS, so the fused yaw is tied to the magnetometer. On good GPS it
under-reports sustained turns by 5 % (up to 15 % in fast 5 s corners), and
in every tunnel hole it over-rotated, by up to 14° — a steel structure does
that to a compass, and structures are what cause holes. The raw gyro has the
right scale (1.03) but picks up cradle vibration (4–6 °/s at idle on two
axes), so it is noisier in open sky. Each hole keeps the source whose
integrated heading closes better on the two anchors; on the Motegi session
the gyro wins 7 of 9 tunnel holes and 17 of 45 open-sky windows.

Why the ribbon bound: after the tunnel exit the Doppler speed reads low for a
few seconds while the receiver re-acquires, and a low speed at a given yaw
rate draws a tighter radius — the line cut 10–17 m inside the long right-
hander on every lap, with both heading sources. The car was on the asphalt,
so a point reconstructed beyond half the track width (the ribbon the circuit
screen draws, 12 m when no width is stored) is moved onto the ribbon edge.
Those points show the nearest edge, not a measured position; the share is
reported per bridge. Scaling the speed inside the hole to fit the corridor
was tried and measured worse on open-sky windows.

Evidence (`bench/hole-bridge.ts`, windows of real good GPS degraded to
speed-only fixes and bridged from the real IMU stream with the outline
available as in the app; the hidden 4.7 m fixes are the truth):

| hole | windows | bridge mean err | 9 of 10 windows under | worst | chord mean err | points bounded |
| --- | --- | --- | --- | --- | --- | --- |
| 10 s | 60 | 1.6 m | 2.8 m | 6.5 m | 41 m | 16 % |
| 20 s | 53 | 2.8 m | 4.7 m | 11.8 m | 104 m | 20 % |
| 31 s | 45 | 3.7 m | 5.1 m | 14.1 m | 165 m | 27 % |

The nine real tunnel holes (eight laps and the out-lap) all bridge and stay
on the ribbon, with 0–30 % of their points moved onto its edge; the laps
agree with each other through the slow corner and the long right-hander.

Guards — any failure keeps the hole open: hole ≤ 45 s; a speed sample at
most every 3 s inside it; the car moving (≥ 3 m/s) throughout; at least one
heading source calibrated on ≥ 50 chord pairs with r² ≥ 0.9; closure miss
≤ 10 % of the path; no point more than 25 m from the track outline when the
track has one (checked before the bound). Holes without speed inside — true
silence — reconstruct at 39 m mean over 31 s and are therefore never
bridged.

This does not reopen the Phase 2 phone-IMU verdict
(`docs/kalman/phase-2-imu-fusion.md`): that verdict killed integrating
CoreMotion's *user acceleration*, which the OS filters. Yaw and gyro rate
are not filtered that way, and speed here comes from the GNSS Doppler, not
the accelerometer.

## What remains

True-silence holes (nothing delivered at all — e.g. the gantry) are not
bridgeable with real data; they stay as honest splits in the line. The
first fix of each cascade stays quarantined; the display merge renders it
anyway if it passes the display filters.
