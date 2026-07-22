import {
  OFFLINE_YEARLY_GRACE_MS,
  PURCHASE_MATCH_TOLERANCE_MS,
  canUseCachedPaidEntitlement,
  createStoreSnapshotSequencer,
  createPaidEntitlementCache,
  hasGrandfatheringBuildConflict,
  hasProAccessForStatus,
  isSubscriptionEntitled,
  isGrandfatheredBuild,
  nextCachedPaidEntitlementCheckAt,
  preferredDirectPurchaseSource,
  purchaseMatchesRequest,
  selectPaidProSource,
  shouldFailClosedForFreshInstall,
  shouldRefreshStore,
  shouldResolveGrandfathering,
  type CachedPaidEntitlement,
} from '../entitlements';

describe('entitlement policy', () => {
  it('never grants Pro while entitlement resolution is pending', () => {
    expect(hasProAccessForStatus('pending')).toBe(false);
    expect(hasProAccessForStatus('resolved_free')).toBe(false);
    expect(hasProAccessForStatus('resolved_pro')).toBe(true);
    expect(hasProAccessForStatus('offline_grace')).toBe(true);
  });

  it('fails closed for a clean iOS install that cannot verify AppTransaction', () => {
    expect(shouldFailClosedForFreshInstall('ios', false, false)).toBe(true);
    expect(shouldFailClosedForFreshInstall('ios', true, false)).toBe(false);
    expect(shouldFailClosedForFreshInstall('ios', undefined, false)).toBe(false);
    expect(shouldFailClosedForFreshInstall('ios', false, true)).toBe(false);
    expect(shouldFailClosedForFreshInstall('android', false, false)).toBe(false);
  });

  it('matches grandfathered builds by exact CFBundleVersion string', () => {
    expect(isGrandfatheredBuild('2', ['1', '2', '12'])).toBe(true);
    expect(isGrandfatheredBuild('02', ['2'])).toBe(false);
    expect(isGrandfatheredBuild(null, ['1'])).toBe(false);
  });

  it('only resolves grandfathering for a pending iOS check', () => {
    expect(shouldResolveGrandfathering('ios', 'pending')).toBe(true);
    expect(shouldResolveGrandfathering('ios', 'ineligible')).toBe(false);
    expect(shouldResolveGrandfathering('android', 'pending')).toBe(false);
    expect(shouldResolveGrandfathering('web', 'pending')).toBe(false);
  });

  it('detects when a production iOS build was added to the early-user allowlist', () => {
    expect(hasGrandfatheringBuildConflict('ios', true, '56', ['1', '55', '56'])).toBe(true);
    expect(hasGrandfatheringBuildConflict('ios', false, '56', ['56'])).toBe(false);
    expect(hasGrandfatheringBuildConflict('android', true, '56', ['56'])).toBe(false);
    expect(hasGrandfatheringBuildConflict('ios', true, null, ['56'])).toBe(false);
  });

  it('prefers a lifetime purchase when both products are active', () => {
    expect(selectPaidProSource(true, true)).toBe('lifetime');
    expect(selectPaidProSource(true, false)).toBe('yearly');
    expect(selectPaidProSource(false, false)).toBeNull();
  });

  it('keeps an iOS subscription entitled through Apple billing grace', () => {
    const now = Date.parse('2026-07-21T00:00:00.000Z');

    expect(
      isSubscriptionEntitled(
        { isActive: false, gracePeriodExpirationDate: now + 60_000 },
        now,
      ),
    ).toBe(true);
    expect(
      isSubscriptionEntitled(
        { isActive: false, gracePeriodExpirationDate: now - 1 },
        now,
      ),
    ).toBe(false);
  });

  it('does not let an annual update replace cached lifetime access', () => {
    expect(preferredDirectPurchaseSource('lifetime', 'yearly')).toBe('lifetime');
    expect(preferredDirectPurchaseSource('yearly', 'lifetime')).toBe('lifetime');
    expect(preferredDirectPurchaseSource(null, 'yearly')).toBe('yearly');
  });

  it('stores the signed annual expiration date', () => {
    const expiration = Date.parse('2027-07-21T00:00:00.000Z');

    expect(
      createPaidEntitlementCache('yearly', '2026-07-21T00:00:00.000Z', expiration),
    ).toEqual({
      source: 'yearly',
      verifiedAt: '2026-07-21T00:00:00.000Z',
      expiresAt: '2027-07-21T00:00:00.000Z',
    });
  });

  it('keeps annual access through its expiration and seven offline grace days', () => {
    const expiration = Date.parse('2027-07-21T00:00:00.000Z');
    const cache = createPaidEntitlementCache(
      'yearly',
      '2026-07-21T00:00:00.000Z',
      expiration,
    );

    expect(canUseCachedPaidEntitlement(cache, expiration + OFFLINE_YEARLY_GRACE_MS)).toBe(true);
    expect(canUseCachedPaidEntitlement(cache, expiration + OFFLINE_YEARLY_GRACE_MS + 1)).toBe(false);
  });

  it('uses the verification date as a conservative fallback when expiration is missing', () => {
    const verifiedAt = Date.parse('2026-07-21T00:00:00.000Z');
    const cache: CachedPaidEntitlement = {
      source: 'yearly',
      verifiedAt: new Date(verifiedAt).toISOString(),
      expiresAt: null,
    };

    expect(canUseCachedPaidEntitlement(cache, verifiedAt + OFFLINE_YEARLY_GRACE_MS)).toBe(true);
    expect(canUseCachedPaidEntitlement(cache, verifiedAt + OFFLINE_YEARLY_GRACE_MS + 1)).toBe(false);
  });

  it('schedules annual rechecks at store expiration and the offline deadline', () => {
    const expiration = Date.parse('2027-07-21T00:00:00.000Z');
    const cache = createPaidEntitlementCache(
      'yearly',
      '2026-07-21T00:00:00.000Z',
      expiration,
    );

    expect(nextCachedPaidEntitlementCheckAt(cache, expiration - 1)).toBe(expiration + 1);
    expect(nextCachedPaidEntitlementCheckAt(cache, expiration + 1)).toBe(
      expiration + OFFLINE_YEARLY_GRACE_MS + 1,
    );
    expect(
      nextCachedPaidEntitlementCheckAt(cache, expiration + OFFLINE_YEARLY_GRACE_MS + 1),
    ).toBeNull();
  });

  it('only schedules the hard deadline when a store has no expiration date', () => {
    const verifiedAt = Date.parse('2026-07-21T00:00:00.000Z');
    const cache = createPaidEntitlementCache('yearly', new Date(verifiedAt).toISOString());

    expect(nextCachedPaidEntitlementCheckAt(cache, verifiedAt)).toBe(
      verifiedAt + OFFLINE_YEARLY_GRACE_MS + 1,
    );
  });

  it('keeps lifetime access offline without an age limit', () => {
    expect(
      canUseCachedPaidEntitlement(
        createPaidEntitlementCache('lifetime', '2020-01-01T00:00:00.000Z'),
        Date.parse('2030-01-01T00:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('does not let a stale same-product transaction settle a new request', () => {
    const pending = { productId: 'yearly', startedAtMs: 1_000_000 };

    expect(
      purchaseMatchesRequest(
        { productId: 'yearly', transactionDate: pending.startedAtMs },
        pending,
      ),
    ).toBe(true);
    expect(
      purchaseMatchesRequest(
        // A device clock a few minutes ahead of Apple's server time must not
        // reject the user's own fresh purchase.
        { productId: 'yearly', transactionDate: pending.startedAtMs - 2 * 60_000 },
        pending,
      ),
    ).toBe(true);
    expect(
      purchaseMatchesRequest(
        {
          productId: 'yearly',
          transactionDate: pending.startedAtMs - PURCHASE_MATCH_TOLERANCE_MS - 1,
        },
        pending,
      ),
    ).toBe(false);
    expect(
      purchaseMatchesRequest(
        { productId: 'lifetime', transactionDate: pending.startedAtMs },
        pending,
      ),
    ).toBe(false);
  });

  it('throttles foreground StoreKit refreshes until the interval elapses', () => {
    expect(shouldRefreshStore(1_000, 1_000 + 299_999)).toBe(false);
    expect(shouldRefreshStore(1_000, 1_000 + 300_000)).toBe(true);
  });

  it('ignores a query result that predates a direct StoreKit state change', () => {
    const sequencer = createStoreSnapshotSequencer();
    const staleQuery = sequencer.startQuery();

    sequencer.invalidateQueries();

    expect(sequencer.tryApply(staleQuery)).toBe(false);
  });

  it('lets the newest completed query supersede an older result', () => {
    const sequencer = createStoreSnapshotSequencer();
    const olderQuery = sequencer.startQuery();
    const newerQuery = sequencer.startQuery();

    expect(sequencer.tryApply(newerQuery)).toBe(true);
    expect(sequencer.tryApply(olderQuery)).toBe(false);
  });

  it('allows an older query to apply while a newer query remains unresolved', () => {
    const sequencer = createStoreSnapshotSequencer();
    const olderQuery = sequencer.startQuery();
    const newerQuery = sequencer.startQuery();

    expect(sequencer.tryApply(olderQuery)).toBe(true);
    expect(sequencer.tryApply(newerQuery)).toBe(true);
  });
});
