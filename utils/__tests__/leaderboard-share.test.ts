import { shouldShowSessionShareButton } from '@/utils/leaderboard-share';

describe('session detail share button', () => {
  it('shows only on the best session of a never-shared track', () => {
    const neverShared = { sharedLapTimeMs: null, offeredLapTimeMs: null };

    expect(
      shouldShowSessionShareButton(
        { userBestLapMs: 62000, ...neverShared },
        62000,
      ),
    ).toBe(true);
    expect(
      shouldShowSessionShareButton(
        { userBestLapMs: 62000, ...neverShared },
        65000,
      ),
    ).toBe(false);
  });

  it('keeps the best session shareable after a declined offer', () => {
    expect(
      shouldShowSessionShareButton(
        { userBestLapMs: 62000, sharedLapTimeMs: null, offeredLapTimeMs: 62000 },
        62000,
      ),
    ).toBe(true);
  });

  it('hides without a user-driven best lap', () => {
    expect(
      shouldShowSessionShareButton(
        { userBestLapMs: null, sharedLapTimeMs: null, offeredLapTimeMs: null },
        null,
      ),
    ).toBe(false);
  });

  it('shows only on the record-holding session once shared', () => {
    const sharedAt62 = {
      userBestLapMs: 61800,
      sharedLapTimeMs: 62000,
      offeredLapTimeMs: 62000,
    };

    expect(shouldShowSessionShareButton(sharedAt62, 61800)).toBe(true);
    expect(shouldShowSessionShareButton(sharedAt62, 63000)).toBe(false);
  });

  it('hides once the shared time matches the best', () => {
    expect(
      shouldShowSessionShareButton(
        {
          userBestLapMs: 62000,
          sharedLapTimeMs: 62000,
          offeredLapTimeMs: 62000,
        },
        62000,
      ),
    ).toBe(false);
  });
});
