import { getSessionOutcome, shouldOfferShareOnCompletion } from '@/utils/session-complete';

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

describe('shouldOfferShareOnCompletion', () => {
  it('offers every first lap time and new best that is not on the board', () => {
    expect(shouldOfferShareOnCompletion('firstAtTrack', 65000, null)).toBe(true);
    expect(shouldOfferShareOnCompletion('newBest', 61800, null)).toBe(true);
    expect(shouldOfferShareOnCompletion('newBest', 61800, 62000)).toBe(true);
  });

  it('never offers a session that set no best', () => {
    expect(shouldOfferShareOnCompletion('saved', 63000, null)).toBe(false);
    expect(shouldOfferShareOnCompletion('noTimedLap', null, null)).toBe(false);
  });

  it('never offers a time the board already has, or beats', () => {
    expect(shouldOfferShareOnCompletion('newBest', 61800, 61800)).toBe(false);
    expect(shouldOfferShareOnCompletion('firstAtTrack', 65000, 64000)).toBe(false);
  });
});
