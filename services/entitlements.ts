export const PRO_ANNUAL_PRODUCT_ID = 'com.trakio.mobile.pro.yearly';
export const PRO_LIFETIME_PRODUCT_ID = 'com.trakio.mobile.pro.lifetime';
export const OFFLINE_YEARLY_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const STORE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
// transactionDate is Apple server time while startedAtMs is the device clock;
// the window must absorb realistic clock skew. Stale replayed transactions
// (the case this guards against) are hours-to-days old, so minutes are safe.
export const PURCHASE_MATCH_TOLERANCE_MS = 10 * 60_000;

export type PaidProSource = 'yearly' | 'lifetime';
export type ProSource = PaidProSource | 'grandfathered';
export type GrandfatheringStatus = 'pending' | 'eligible' | 'ineligible' | 'not_applicable';
export type AccessStatus = 'pending' | 'resolved_free' | 'resolved_pro' | 'offline_grace';

export type CachedPaidEntitlement = {
  source: PaidProSource;
  verifiedAt: string;
  expiresAt: string | null;
};

export function hasProAccessForStatus(status: AccessStatus): boolean {
  return status === 'resolved_pro' || status === 'offline_grace';
}

export function shouldFailClosedForFreshInstall(
  platform: string,
  installedBeforeMonetization: boolean | undefined,
  canVerifyOriginalAppVersion: boolean,
): boolean {
  return (
    platform === 'ios' &&
    installedBeforeMonetization === false &&
    !canVerifyOriginalAppVersion
  );
}

type PurchaseIdentity = {
  productId: string;
  transactionDate: number;
};

type PendingPurchaseIdentity = {
  productId: string;
  startedAtMs: number;
};

export type StoreSnapshotSequencer = {
  startQuery: () => number;
  invalidateQueries: () => number;
  tryApply: (generation: number) => boolean;
};

type SubscriptionEntitlement = {
  isActive: boolean;
  gracePeriodExpirationDate?: number | null;
};

export function createStoreSnapshotSequencer(): StoreSnapshotSequencer {
  let nextGeneration = 0;
  let latestAppliedGeneration = 0;

  return {
    startQuery() {
      nextGeneration += 1;
      return nextGeneration;
    },
    invalidateQueries() {
      nextGeneration += 1;
      latestAppliedGeneration = nextGeneration;
      return nextGeneration;
    },
    tryApply(generation) {
      if (generation < latestAppliedGeneration) {
        return false;
      }

      latestAppliedGeneration = generation;
      return true;
    },
  };
}

export function purchaseMatchesRequest(
  purchase: PurchaseIdentity,
  pending: PendingPurchaseIdentity | null,
  toleranceMs: number = PURCHASE_MATCH_TOLERANCE_MS,
): boolean {
  return Boolean(
    pending &&
      purchase.productId === pending.productId &&
      purchase.transactionDate >= pending.startedAtMs - toleranceMs,
  );
}

export function shouldRefreshStore(
  lastAttemptAtMs: number,
  nowMs: number = Date.now(),
  intervalMs: number = STORE_REFRESH_INTERVAL_MS,
): boolean {
  return nowMs - lastAttemptAtMs >= intervalMs;
}

export function isGrandfatheredBuild(
  originalApplicationVersion: string | null,
  eligibleBuilds: readonly string[],
): boolean {
  return originalApplicationVersion !== null && eligibleBuilds.includes(originalApplicationVersion);
}

export function shouldResolveGrandfathering(
  platform: string,
  status: GrandfatheringStatus,
): boolean {
  return platform === 'ios' && status === 'pending';
}

export function hasGrandfatheringBuildConflict(
  platform: string,
  isProductionBuild: boolean,
  nativeBuildVersion: string | null,
  eligibleBuilds: readonly string[],
): boolean {
  return (
    platform === 'ios' &&
    isProductionBuild &&
    nativeBuildVersion !== null &&
    eligibleBuilds.includes(nativeBuildVersion)
  );
}

export function selectPaidProSource(
  hasAnnual: boolean,
  hasLifetime: boolean,
): PaidProSource | null {
  if (hasLifetime) {
    return 'lifetime';
  }

  return hasAnnual ? 'yearly' : null;
}

export function isSubscriptionEntitled(
  subscription: SubscriptionEntitlement,
  nowMs: number = Date.now(),
): boolean {
  return (
    subscription.isActive ||
    (typeof subscription.gracePeriodExpirationDate === 'number' &&
      Number.isFinite(subscription.gracePeriodExpirationDate) &&
      subscription.gracePeriodExpirationDate > nowMs)
  );
}

export function preferredDirectPurchaseSource(
  cachedSource: PaidProSource | null | undefined,
  incomingSource: PaidProSource,
): PaidProSource {
  return cachedSource === 'lifetime' ? 'lifetime' : incomingSource;
}

export function createPaidEntitlementCache(
  source: PaidProSource,
  verifiedAt: string,
  expirationDateMs: number | null = null,
): CachedPaidEntitlement {
  return {
    source,
    verifiedAt,
    expiresAt:
      source === 'yearly' && expirationDateMs !== null
        ? new Date(expirationDateMs).toISOString()
        : null,
  };
}

export function canUseCachedPaidEntitlement(
  cached: CachedPaidEntitlement | null,
  nowMs: number = Date.now(),
): boolean {
  if (!cached) {
    return false;
  }

  if (cached.source === 'lifetime') {
    return true;
  }

  const expirationMs = cachedPaidEntitlementBaseDate(cached);

  return (
    expirationMs !== null &&
    nowMs <= expirationMs + OFFLINE_YEARLY_GRACE_MS
  );
}

function cachedPaidEntitlementBaseDate(cached: CachedPaidEntitlement): number | null {
  const value = cached.expiresAt ? Date.parse(cached.expiresAt) : Date.parse(cached.verifiedAt);
  return Number.isFinite(value) ? value : null;
}

export function nextCachedPaidEntitlementCheckAt(
  cached: CachedPaidEntitlement | null,
  nowMs: number = Date.now(),
): number | null {
  if (!cached || cached.source === 'lifetime') {
    return null;
  }

  const baseDateMs = cachedPaidEntitlementBaseDate(cached);
  if (baseDateMs === null) {
    return null;
  }

  if (cached.expiresAt && nowMs <= baseDateMs) {
    return baseDateMs + 1;
  }

  const offlineDeadlineMs = baseDateMs + OFFLINE_YEARLY_GRACE_MS;
  return nowMs <= offlineDeadlineMs ? offlineDeadlineMs + 1 : null;
}
