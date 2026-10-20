import { getSessionOutcome } from '@/utils/session-complete';

describe('getSessionOutcome', () => {
  it('reports a session without a timed lap', () => {
    expect(getSessionOutcome(null, 62000)).toBe('noTimedLap');
    expect(getSessionOutcome(null, null)).toBe('noTimedLap');
  });

  it('reports the first timed lap at a track', () => {
    expect(getSessionOutcome(65000, null)).toBe('firstAtTrack');
  });

  it('reports a new best only when strictly faster', () => {
    expect(getSessionOutcome(61800, 62000)).toBe('newBest');
    expect(getSessionOutcome(62000, 62000)).toBe('saved');
    expect(getSessionOutcome(63000, 62000)).toBe('saved');
  });
});
