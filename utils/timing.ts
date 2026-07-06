import type { TimingLineType } from '@/db/types';

type TimingLineLike = {
  type: TimingLineType;
};

export function getSectorLineCount(timingLines: TimingLineLike[]) {
  return timingLines.filter((timingLine) => timingLine.type === 'sector').length;
}

// N sector lines divide a lap into N + 1 sectors when the start/finish line
// closes the loop; without a start/finish line there is no sector timing.
export function getSectorCount(timingLines: TimingLineLike[]) {
  const sectorLineCount = getSectorLineCount(timingLines);
  const hasStartFinish = timingLines.some((timingLine) => timingLine.type === 'start_finish');

  if (sectorLineCount === 0) {
    return 0;
  }

  return sectorLineCount + (hasStartFinish ? 1 : 0);
}
