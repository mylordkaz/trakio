import {
  shouldOfferLeaderboardShare,
  shouldShowSessionShareButton,
} from '@/utils/leaderboard-share';

describe('session complete share offer', () => {
  it('never offers without a user-driven best lap', () => {
    expect(
      shouldOfferLeaderboardShare({
        userBestLapMs: null,
        sharedLapTimeMs: null,
        offeredLapTimeMs: null,
      }, null),
    ).toBe(false);
  });

  it('offers the first best exactly once', () => {
    expect(
      shouldOfferLeaderboardShare({
        userBestLapMs: 62000,
        sharedLapTimeMs: null,
        offeredLapTimeMs: null,
      }, 62000),
    ).toBe(true);

    expect(
      shouldOfferLeaderboardShare({
        userBestLapMs: 62000,
        sharedLapTimeMs: null,
        offeredLapTimeMs: 62000,
      }, 62000),
    ).toBe(false);
  });

  it('stays quiet after a decline until the declined best is beaten', () => {
    const declinedAt62 = { sharedLapTimeMs: null, offeredLapTimeMs: 62000 };

    expect(
      shouldOfferLeaderboardShare({ userBestLapMs: 62500, ...declinedAt62 }, 62500),
    ).toBe(false);
    expect(
      shouldOfferLeaderboardShare({ userBestLapMs: 61800, ...declinedAt62 }, 61800),
    ).toBe(true);
  });

  it('never offers a best that is already on the board', () => {
    expect(
      shouldOfferLeaderboardShare({
        userBestLapMs: 62000,
        sharedLapTimeMs: 62000,
        offeredLapTimeMs: null,
      }, 62000),
    ).toBe(false);

    expect(
      shouldOfferLeaderboardShare({
        userBestLapMs: 61800,
        sharedLapTimeMs: 62000,
        offeredLapTimeMs: null,
      }, 61800),
    ).toBe(true);
  });

  it('offers only from the session that holds the track best', () => {
    expect(
      shouldOfferLeaderboardShare(
        { userBestLapMs: 62000, sharedLapTimeMs: null, offeredLapTimeMs: null },
        65000,
      ),
    ).toBe(false);
    expect(
      shouldOfferLeaderboardShare(
        { userBestLapMs: 62000, sharedLapTimeMs: null, offeredLapTimeMs: null },
        null,
      ),
    ).toBe(false);
  });

  it('re-offers a shared track only on improvement', () => {
    expect(
      shouldOfferLeaderboardShare({
        userBestLapMs: 61800,
        sharedLapTimeMs: 62000,
        offeredLapTimeMs: 62000,
      }, 61800),
    ).toBe(true);
  });
});

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
