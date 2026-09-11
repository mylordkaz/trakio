import type { TimingLineType } from '@/db/types';

type TimingLineLike = {
  type: TimingLineType;
};

/**
 * How a track's timing lines close a timed run.
 *
 * - `closed`: one start/finish line; crossing it ends a lap and opens the next.
 * - `point_to_point`: a start line and a separate finish line, so a run begins
 *   at one place and ends at another (the Nordschleife's bridge-to-gantry).
 * - `none`: neither configuration is complete, so nothing can be timed.
 */
export type TimingTopology = 'closed' | 'point_to_point' | 'none';

export function getTimingTopology(timingLines: TimingLineLike[]): TimingTopology {
  if (timingLines.some((timingLine) => timingLine.type === 'start_finish')) {
    return 'closed';
  }

  const hasStart = timingLines.some((timingLine) => timingLine.type === 'start');
  const hasFinish = timingLines.some((timingLine) => timingLine.type === 'finish');

  return hasStart && hasFinish ? 'point_to_point' : 'none';
}

/** Whether a track can be timed at all. */
export function isTimingConfigured(timingLines: TimingLineLike[]) {
  return getTimingTopology(timingLines) !== 'none';
}

export function getSectorLineCount(timingLines: TimingLineLike[]) {
  return timingLines.filter((timingLine) => timingLine.type === 'sector').length;
}

// N sector lines divide a run into N + 1 sectors, the last one closed by the
// start/finish line or by the finish line. Without a complete configuration
// there is nothing to close the final sector against, so there is no sector
// timing at all.
export function getSectorCount(timingLines: TimingLineLike[]) {
  const sectorLineCount = getSectorLineCount(timingLines);

  if (sectorLineCount === 0) {
    return 0;
  }

  return sectorLineCount + (isTimingConfigured(timingLines) ? 1 : 0);
}

/** The line types that open a timed run. */
export function isRunOpeningType(type: TimingLineType) {
  return type === 'start_finish' || type === 'start';
}

/**
 * The line types timing actually consumes. Anything else on a track (pit
 * entry, speed traps) is mapping detail that must not reach detection.
 */
export function isRunTimingType(type: TimingLineType) {
  return (
    type === 'start_finish' || type === 'start' || type === 'finish' || type === 'sector'
  );
}
