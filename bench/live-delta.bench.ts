import { DEFAULT_LIVE_DELTA_FILES, replayLiveDelta } from './live-delta';

// Not part of the regular suite (testMatch is *.test.ts). Run explicitly:
//   npx jest --testMatch '**/bench/live-delta.bench.ts'

describe('live delta replay', () => {
  for (const file of DEFAULT_LIVE_DELTA_FILES) {
    it(`matches the lap-time difference at the line for ${file}`, async () => {
      expect(await replayLiveDelta(file)).toBe(true);
    }, 120_000);
  }
});
