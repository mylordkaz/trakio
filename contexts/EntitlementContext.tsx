import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { usePathname } from 'expo-router';
import {
  ErrorCode,
  deepLinkToSubscriptions,
  endConnection,
  fetchProducts,
  finishTransaction,
  getActiveSubscriptions,
  getAppTransactionIOS,
  getAvailablePurchases,
  initConnection,
  isTransactionVerifiedIOS,
  latestTransactionIOS,
  purchaseUpdatedListener,
  requestPurchase,
  showManageSubscriptionsIOS,
  syncIOS,
  type ActiveSubscription,
  type ExpoPurchaseError,
  type Product,
  type ProductSubscription,
  type Purchase,
} from 'expo-iap';
import { useSQLiteContext } from 'expo-sqlite';
import { Storage } from 'expo-sqlite/kv-store';
import { wasInstalledBeforeMonetization } from '@/db/app-metadata';
import {
  PRO_ANNUAL_PRODUCT_ID,
  PRO_LIFETIME_PRODUCT_ID,
  canUseCachedPaidEntitlement,
  createPaidEntitlementCache,
  createStoreSnapshotSequencer,
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
  type AccessStatus,
  type CachedPaidEntitlement,
  type GrandfatheringStatus,
  type PaidProSource,
  type ProSource,
} from '@/services/entitlements';

const GRANDFATHERING_CACHE_KEY = 'pro_grandfathering_v1';
const PAID_ENTITLEMENT_CACHE_KEY = 'pro_paid_entitlement_v1';
const PURCHASE_TIMEOUT_MS = 90_000;
const MAX_ENTITLEMENT_TIMER_DELAY_MS = 24 * 60 * 60 * 1000;

function readValue(key: string): string | null {
  try {
    return Storage.getItemSync(key);
  } catch {
    return null;
  }
}

function storeValue(key: string, value: string) {
  try {
    Storage.setItemSync(key, value);
  } catch {
    // Entitlement resolution remains usable for this app session.
  }
}

function removeValue(key: string) {
  try {
    Storage.removeItemSync(key);
  } catch {
    // A later successful StoreKit refresh will retry cache cleanup.
  }
}

type MonetizationConfig = {
  grandfatheredIosBuilds?: string[];
  forceGrandfathered?: boolean;
  forceFree?: boolean;
};

export type StoreProduct = {
  id: string;
  displayPrice: string;
  androidOfferToken?: string;
};

export type PurchaseOutcome = 'purchased' | 'deferred' | 'cancelled' | 'failed';
export type RestoreOutcome = 'restored' | 'empty' | 'failed';

type StoreEntitlementSnapshot = {
  source: PaidProSource | null;
  annualExpirationDateMs: number | null;
  // Distinguishes an observed lifetime refund from mere absence: signed-out
  // or post-restore StoreKit caches resolve empty without throwing, so
  // absence alone must not clear lifetime access.
  lifetimeRevoked: boolean;
  checkedAt: string;
};

type PendingPurchase = {
  productId: string;
  startedAtMs: number;
  resolve: (outcome: PurchaseOutcome) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type EntitlementContextValue = {
  accessStatus: AccessStatus;
  grandfatheringStatus: GrandfatheringStatus;
  canResolveGrandfathering: boolean;
  hasProAccess: boolean;
  source: ProSource | null;
  annualProduct: StoreProduct | null;
  lifetimeProduct: StoreProduct | null;
  isStoreAvailable: boolean;
  isLoadingProducts: boolean;
  isProcessing: boolean;
  purchaseAnnual: () => Promise<PurchaseOutcome>;
  purchaseLifetime: () => Promise<PurchaseOutcome>;
  restorePurchases: () => Promise<RestoreOutcome>;
  refresh: () => Promise<void>;
  manageSubscription: () => Promise<void>;
};

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

function getMonetizationConfig(): MonetizationConfig {
  return (Constants.expoConfig?.extra?.monetization as MonetizationConfig | undefined) ?? {};
}

function isDevelopmentOverride(config: MonetizationConfig, key: 'forceGrandfathered' | 'forceFree') {
  return __DEV__ && config[key] === true;
}

function readGrandfatheringStatus(config: MonetizationConfig): GrandfatheringStatus {
  if (Platform.OS !== 'ios') {
    return 'not_applicable';
  }

  if (isDevelopmentOverride(config, 'forceFree')) {
    return 'ineligible';
  }

  if (isDevelopmentOverride(config, 'forceGrandfathered')) {
    return 'eligible';
  }

  const cached = readValue(GRANDFATHERING_CACHE_KEY);
  return cached === 'eligible' || cached === 'ineligible' ? cached : 'pending';
}

function readPaidCache(): CachedPaidEntitlement | null {
  const value = readValue(PAID_ENTITLEMENT_CACHE_KEY);
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<CachedPaidEntitlement>;
    const hasValidExpiration =
      parsed.expiresAt === null ||
      parsed.expiresAt === undefined ||
      (typeof parsed.expiresAt === 'string' && Number.isFinite(Date.parse(parsed.expiresAt)));

    if (
      (parsed.source === 'yearly' || parsed.source === 'lifetime') &&
      typeof parsed.verifiedAt === 'string' &&
      Number.isFinite(Date.parse(parsed.verifiedAt)) &&
      hasValidExpiration
    ) {
      return {
        source: parsed.source,
        verifiedAt: parsed.verifiedAt,
        expiresAt: parsed.expiresAt ?? null,
      };
    }
  } catch {
    // Ignore corrupt local cache and resolve again from StoreKit.
  }

  return null;
}

function initialAccess(
  grandfatheringStatus: GrandfatheringStatus,
  paidCache: CachedPaidEntitlement | null,
): { status: AccessStatus; source: ProSource | null } {
  if (grandfatheringStatus === 'eligible') {
    return { status: 'resolved_pro', source: 'grandfathered' };
  }

  if (canUseCachedPaidEntitlement(paidCache)) {
    return { status: 'offline_grace', source: paidCache!.source };
  }

  if (grandfatheringStatus === 'pending') {
    return { status: 'pending', source: null };
  }

  return { status: 'resolved_free', source: null };
}

function purchaseOutcomeFromError(error: unknown): PurchaseOutcome {
  const code = (error as Partial<ExpoPurchaseError> | null)?.code;
  if (code === ErrorCode.UserCancelled) {
    return 'cancelled';
  }
  // Ask to Buy: StoreKit rejects the request while the purchase awaits
  // approval; the approved transaction arrives later via the update listener.
  if (code === ErrorCode.DeferredPayment) {
    return 'deferred';
  }
  return 'failed';
}

function supportsAppTransactionIOS(): boolean {
  if (Platform.OS !== 'ios') {
    return false;
  }

  const majorVersion =
    typeof Platform.Version === 'number'
      ? Math.floor(Platform.Version)
      : Number.parseInt(String(Platform.Version), 10);
  return Number.isFinite(majorVersion) && majorVersion >= 16;
}

function isRecordingPath(pathname: string): boolean {
  return pathname.endsWith('/record/recording');
}

function isStorePlatform(platform: string): boolean {
  return platform === 'ios' || platform === 'android';
}

function isTrackedProduct(productId: string): boolean {
  return productId === PRO_ANNUAL_PRODUCT_ID || productId === PRO_LIFETIME_PRODUCT_ID;
}

function purchaseExpirationDate(purchase: Purchase | null | undefined): number | null {
  if (!purchase || !('expirationDateIOS' in purchase)) {
    return null;
  }

  return purchase.expirationDateIOS ?? null;
}

function purchaseGracePeriodExpirationDate(
  purchase: Purchase | null | undefined,
): number | null {
  if (!purchase || !('renewalInfoIOS' in purchase)) {
    return null;
  }

  return purchase.renewalInfoIOS?.gracePeriodExpirationDate ?? null;
}

function purchaseAccessExpirationDate(purchase: Purchase | null | undefined): number | null {
  const candidates = [
    purchaseExpirationDate(purchase),
    purchaseGracePeriodExpirationDate(purchase),
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

function purchaseHasProduct(purchase: Purchase, productId: string): boolean {
  return purchase.productId === productId || purchase.ids?.includes(productId) === true;
}

function androidSubscriptionOfferToken(product: ProductSubscription): string | null {
  if (product.platform !== 'android') {
    return null;
  }

  return (
    product.subscriptionOffers.find((offer) => offer.offerTokenAndroid)?.offerTokenAndroid ??
    product.subscriptionOfferDetailsAndroid[0]?.offerToken ??
    null
  );
}

function activeSubscriptionExpirationDate(
  subscription: ActiveSubscription | undefined,
  purchase: Purchase | null | undefined,
): number | null {
  const candidates = [
    subscription?.expirationDateIOS,
    subscription?.renewalInfoIOS?.gracePeriodExpirationDate,
    purchaseExpirationDate(purchase),
    purchaseGracePeriodExpirationDate(purchase),
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const latestExpiration = candidates.length > 0 ? Math.max(...candidates) : null;

  return latestExpiration !== null && latestExpiration > Date.now() ? latestExpiration : null;
}

function isUsablePurchase(purchase: Purchase | null | undefined): purchase is Purchase {
  if (!purchase || purchase.purchaseState !== 'purchased') {
    return false;
  }

  if ('revocationDateIOS' in purchase && purchase.revocationDateIOS != null) {
    return false;
  }

  return !('isSuspendedAndroid' in purchase) || purchase.isSuspendedAndroid !== true;
}

function isRevokedPurchase(purchase: Purchase | null | undefined): boolean {
  return Boolean(
    purchase && 'revocationDateIOS' in purchase && purchase.revocationDateIOS != null,
  );
}

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const pathname = usePathname();
  const config = useMemo(getMonetizationConfig, []);
  const forceFree = isDevelopmentOverride(config, 'forceFree');
  const initialGrandfathering = useMemo(() => readGrandfatheringStatus(config), [config]);
  const initialPaidCache = useMemo(() => (forceFree ? null : readPaidCache()), [forceFree]);
  const initial = useMemo(
    () => initialAccess(initialGrandfathering, initialPaidCache),
    [initialGrandfathering, initialPaidCache],
  );
  const [snapshotSequencer] = useState(createStoreSnapshotSequencer);
  const canResolveGrandfathering = supportsAppTransactionIOS();
  const [grandfatheringStatus, setGrandfatheringStatus] =
    useState<GrandfatheringStatus>(initialGrandfathering);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>(initial.status);
  const [source, setSource] = useState<ProSource | null>(initial.source);
  const [annualProduct, setAnnualProduct] = useState<StoreProduct | null>(null);
  const [lifetimeProduct, setLifetimeProduct] = useState<StoreProduct | null>(null);
  const [isStoreAvailable, setIsStoreAvailable] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paidCacheRevision, setPaidCacheRevision] = useState(0);
  const grandfatheringRef = useRef(initialGrandfathering);
  const paidCacheRef = useRef(initialPaidCache);
  const pathnameRef = useRef(pathname);
  const previousRecordingPathRef = useRef(isRecordingPath(pathname));
  pathnameRef.current = pathname;
  const preMonetizationInstallRef = useRef<boolean | undefined>(undefined);
  const storeConnectedRef = useRef(false);
  const storeConnectionPromiseRef = useRef<Promise<boolean> | null>(null);
  const storeRefreshPromiseRef = useRef<Promise<void> | null>(null);
  const lastStoreRefreshAttemptAtRef = useRef(0);
  const productsLoadedRef = useRef(false);
  const mountedRef = useRef(true);
  const pendingPurchaseRef = useRef<PendingPurchase | null>(null);
  const processedPurchasesRef = useRef(new Set<string>());
  const hasBuildConflict = hasGrandfatheringBuildConflict(
    Platform.OS,
    !__DEV__,
    Constants.nativeBuildVersion,
    config.grandfatheredIosBuilds ?? [],
  );

  const updateGrandfathering = useCallback((
    next: GrandfatheringStatus,
    persist: boolean = true,
  ) => {
    grandfatheringRef.current = next;
    if (persist && (next === 'eligible' || next === 'ineligible')) {
      storeValue(GRANDFATHERING_CACHE_KEY, next);
    }
    if (mountedRef.current) {
      setGrandfatheringStatus(next);
    }
  }, []);

  const updatePaidCache = useCallback((next: CachedPaidEntitlement | null) => {
    paidCacheRef.current = next;
    if (next) {
      storeValue(PAID_ENTITLEMENT_CACHE_KEY, JSON.stringify(next));
    } else {
      removeValue(PAID_ENTITLEMENT_CACHE_KEY);
    }

    if (mountedRef.current) {
      setPaidCacheRevision((revision) => revision + 1);
    }
  }, []);

  const applyAccess = useCallback((paidCache: CachedPaidEntitlement | null) => {
    if (!mountedRef.current) {
      return;
    }

    const next = initialAccess(grandfatheringRef.current, forceFree ? null : paidCache);
    setAccessStatus(next.status);
    setSource(next.source);
  }, [forceFree]);

  const resolveGrandfathering = useCallback(
    async (canReadStore: boolean): Promise<GrandfatheringStatus> => {
      if (!shouldResolveGrandfathering(Platform.OS, grandfatheringRef.current)) {
        return grandfatheringRef.current;
      }

      // A new production build must never appear in the pre-monetization allowlist.
      // Keep eligibility unresolved and access closed until a corrected build ships.
      if (hasBuildConflict) {
        return 'pending';
      }

      if (preMonetizationInstallRef.current === undefined) {
        try {
          preMonetizationInstallRef.current = await wasInstalledBeforeMonetization(db);
        } catch {
          // AppTransaction remains available as the authoritative fallback.
        }
      }

      if (preMonetizationInstallRef.current === true) {
        updateGrandfathering('eligible');
        return 'eligible';
      }

      if (
        shouldFailClosedForFreshInstall(
          Platform.OS,
          preMonetizationInstallRef.current,
          canResolveGrandfathering,
        )
      ) {
        // iOS 15 cannot verify AppTransaction. A clean database therefore stays
        // Free while running iOS 15. Do not persist the decision so a later launch
        // on iOS 16+ can still recover legitimate early-user access.
        updateGrandfathering('ineligible', false);
        return 'ineligible';
      }

      const eligibleBuilds = config.grandfatheredIosBuilds ?? [];
      if (!canReadStore || eligibleBuilds.length === 0 || !canResolveGrandfathering) {
        return 'pending';
      }

      try {
        const appTransaction = await getAppTransactionIOS();
        if (!appTransaction) {
          return 'pending';
        }

        if (appTransaction.environment.toLowerCase() !== 'production') {
          if (!__DEV__) {
            // App Review and TestFlight use sandbox AppTransactions whose
            // original version is not meaningful. A fresh production-profile
            // install must still expose real free-tier behavior for review.
            updateGrandfathering('ineligible', false);
            return 'ineligible';
          }
          return 'pending';
        }

        const next = isGrandfatheredBuild(
          appTransaction.originalAppVersion,
          eligibleBuilds,
        )
          ? 'eligible'
          : 'ineligible';
        updateGrandfathering(next);
        return next;
      } catch {
        // A transient or unverified AppTransaction remains unresolved and
        // therefore does not grant Pro access.
        return 'pending';
      }
    },
    [
      config.grandfatheredIosBuilds,
      canResolveGrandfathering,
      db,
      hasBuildConflict,
      updateGrandfathering,
    ],
  );

  const queryStoreEntitlements = useCallback(async (): Promise<StoreEntitlementSnapshot> => {
    if (Platform.OS === 'android') {
      const purchases = await getAvailablePurchases();
      const annualPurchase = purchases.find(
        (purchase) =>
          purchaseHasProduct(purchase, PRO_ANNUAL_PRODUCT_ID) && isUsablePurchase(purchase),
      );
      const lifetimePurchase = purchases.find(
        (purchase) =>
          purchaseHasProduct(purchase, PRO_LIFETIME_PRODUCT_ID) && isUsablePurchase(purchase),
      );

      return {
        source: selectPaidProSource(Boolean(annualPurchase), Boolean(lifetimePurchase)),
        // Google Play does not expose subscription expiry through BillingClient.
        // A successful query starts a bounded offline window from checkedAt.
        annualExpirationDateMs: null,
        lifetimeRevoked: false,
        checkedAt: new Date().toISOString(),
      };
    }

    const [subscriptions, annualTransaction, lifetimeTransaction] = await Promise.all([
      getActiveSubscriptions([PRO_ANNUAL_PRODUCT_ID]),
      latestTransactionIOS(PRO_ANNUAL_PRODUCT_ID),
      latestTransactionIOS(PRO_LIFETIME_PRODUCT_ID),
    ]);
    const annualSubscription = (subscriptions as ActiveSubscription[]).find(
      (subscription) =>
        subscription.productId === PRO_ANNUAL_PRODUCT_ID &&
        isSubscriptionEntitled({
          isActive: subscription.isActive,
          gracePeriodExpirationDate:
            subscription.renewalInfoIOS?.gracePeriodExpirationDate,
        }),
    );
    const annualPurchase = annualTransaction as Purchase | null;
    const lifetimePurchase = lifetimeTransaction as Purchase | null;
    // latestTransactionIOS throws on a failed verification but returns null
    // for any cold local cache (signed-out, post-restore), not only genuine
    // absence — so null is inconclusive and must not erase lifetime access.
    const hasAnnual = Boolean(annualSubscription);
    const hasLifetime = isUsablePurchase(lifetimePurchase);

    return {
      source: selectPaidProSource(hasAnnual, hasLifetime),
      annualExpirationDateMs: activeSubscriptionExpirationDate(
        annualSubscription,
        annualPurchase,
      ),
      lifetimeRevoked: isRevokedPurchase(lifetimePurchase),
      checkedAt: new Date().toISOString(),
    };
  }, []);

  const applyStoreSnapshot = useCallback(
    (snapshot: StoreEntitlementSnapshot, generation: number) => {
      if (!snapshotSequencer.tryApply(generation)) {
        const cached = paidCacheRef.current;
        return cached && canUseCachedPaidEntitlement(cached) ? cached.source : null;
      }

      if (forceFree) {
        applyAccess(null);
        return null;
      }

      // Inconclusive-absence handling is iOS-specific: Play Billing removes
      // refunded purchases from query results without a revocation marker, so
      // on Android absence from a successful query is authoritative.
      const lifetimeAbsenceInconclusive =
        Platform.OS === 'ios' &&
        paidCacheRef.current?.source === 'lifetime' &&
        !snapshot.lifetimeRevoked;

      if (snapshot.source) {
        if (snapshot.source === 'yearly' && lifetimeAbsenceInconclusive) {
          // A cold lifetime SKU alongside a visible annual subscription must
          // not demote the stronger cached entitlement.
          if (mountedRef.current) {
            setAccessStatus('resolved_pro');
            setSource('lifetime');
          }
          return 'lifetime';
        }

        const cache = createPaidEntitlementCache(
          snapshot.source,
          snapshot.checkedAt,
          snapshot.annualExpirationDateMs,
        );

        updatePaidCache(cache);
        if (mountedRef.current) {
          setAccessStatus('resolved_pro');
          setSource(snapshot.source);
        }
        return snapshot.source;
      }

      if (lifetimeAbsenceInconclusive) {
        // Refunds surface as revoked transactions, so an empty result for a
        // cached lifetime purchase is inconclusive, never proof of loss.
        applyAccess(paidCacheRef.current);
        return 'lifetime';
      }

      updatePaidCache(null);
      applyAccess(null);
      return null;
    },
    [applyAccess, forceFree, snapshotSequencer, updatePaidCache],
  );

  const queryAndApplyStoreEntitlements = useCallback(async () => {
    const generation = snapshotSequencer.startQuery();
    const snapshot = await queryStoreEntitlements();
    return applyStoreSnapshot(snapshot, generation);
  }, [applyStoreSnapshot, queryStoreEntitlements, snapshotSequencer]);

  const loadProducts = useCallback(async () => {
    if (productsLoadedRef.current) {
      return;
    }

    if (mountedRef.current) {
      setIsLoadingProducts(true);
    }

    try {
      const [annualProducts, lifetimeProducts] = await Promise.all([
        fetchProducts({ skus: [PRO_ANNUAL_PRODUCT_ID], type: 'subs' }),
        fetchProducts({ skus: [PRO_LIFETIME_PRODUCT_ID], type: 'in-app' }),
      ]);
      const annual = (annualProducts as ProductSubscription[]).find(
        (product) => product.id === PRO_ANNUAL_PRODUCT_ID,
      );
      const lifetime = (lifetimeProducts as Product[]).find(
        (product) => product.id === PRO_LIFETIME_PRODUCT_ID,
      );
      const annualOfferToken = annual ? androidSubscriptionOfferToken(annual) : null;
      const canPurchaseAnnual =
        Boolean(annual) && (Platform.OS !== 'android' || annualOfferToken !== null);

      if (mountedRef.current) {
        setAnnualProduct(
          annual && canPurchaseAnnual
            ? {
                id: annual.id,
                displayPrice: annual.displayPrice,
                ...(annualOfferToken ? { androidOfferToken: annualOfferToken } : {}),
              }
            : null,
        );
        setLifetimeProduct(
          lifetime ? { id: lifetime.id, displayPrice: lifetime.displayPrice } : null,
        );
      }
      if (canPurchaseAnnual && lifetime) {
        productsLoadedRef.current = true;
      }
    } catch {
      // The paywall keeps its retry action when products are unavailable.
    } finally {
      if (mountedRef.current) {
        setIsLoadingProducts(false);
      }
    }
  }, []);

  const connectStore = useCallback(async () => {
    if (!isStorePlatform(Platform.OS)) {
      return false;
    }

    if (storeConnectedRef.current) {
      return true;
    }

    if (storeConnectionPromiseRef.current) {
      return storeConnectionPromiseRef.current;
    }

    const connectionPromise = initConnection()
      .then((connected) => {
        storeConnectedRef.current = connected;
        if (mountedRef.current) {
          setIsStoreAvailable(connected);
        }
        return connected;
      })
      .finally(() => {
        if (storeConnectionPromiseRef.current === connectionPromise) {
          storeConnectionPromiseRef.current = null;
        }
      });
    storeConnectionPromiseRef.current = connectionPromise;
    return connectionPromise;
  }, []);

  const performStoreRefresh = useCallback(
    async (force: boolean, includeProducts: boolean) => {
      const now = Date.now();
      if (!force && !shouldRefreshStore(lastStoreRefreshAttemptAtRef.current, now)) {
        return;
      }

      if (storeRefreshPromiseRef.current && !force) {
        await storeRefreshPromiseRef.current;
        if (includeProducts) {
          await loadProducts();
        }
        return;
      }

      lastStoreRefreshAttemptAtRef.current = now;
      const refreshPromise = (async () => {
        try {
          // The grandfathering marker lives in the local database; an existing
          // early user must resolve without waiting on StoreKit connectivity.
          await resolveGrandfathering(false);
          applyAccess(paidCacheRef.current);

          const connected = await connectStore();
          await resolveGrandfathering(connected);
          if (!connected) {
            applyAccess(paidCacheRef.current);
            return;
          }

          if (includeProducts) {
            await Promise.all([queryAndApplyStoreEntitlements(), loadProducts()]);
          } else {
            await queryAndApplyStoreEntitlements();
          }
        } catch {
          await resolveGrandfathering(false);
          applyAccess(paidCacheRef.current);
        }
      })();

      storeRefreshPromiseRef.current = refreshPromise;
      try {
        await refreshPromise;
      } finally {
        if (storeRefreshPromiseRef.current === refreshPromise) {
          storeRefreshPromiseRef.current = null;
        }
      }
    },
    [
      applyAccess,
      connectStore,
      loadProducts,
      queryAndApplyStoreEntitlements,
      resolveGrandfathering,
    ],
  );

  const refresh = useCallback(
    () => performStoreRefresh(true, true),
    [performStoreRefresh],
  );

  const settlePendingPurchase = useCallback((outcome: PurchaseOutcome) => {
    const pending = pendingPurchaseRef.current;
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    pendingPurchaseRef.current = null;
    if (mountedRef.current) {
      setIsProcessing(false);
    }
    pending.resolve(outcome);
  }, []);

  const handlePurchaseUpdate = useCallback(
    async (purchase: Purchase) => {
      if (!isTrackedProduct(purchase.productId) || purchase.purchaseState === 'pending') {
        return;
      }

      const purchaseKey = purchase.transactionId ?? purchase.id;
      if (processedPurchasesRef.current.has(purchaseKey)) {
        return;
      }
      processedPurchasesRef.current.add(purchaseKey);

      const matchesPending = purchaseMatchesRequest(purchase, pendingPurchaseRef.current);
      const usable = isUsablePurchase(purchase);
      let verified = Platform.OS !== 'ios';
      if (usable && Platform.OS === 'ios') {
        try {
          verified = await isTransactionVerifiedIOS(purchase.productId);
        } catch {
          verified = false;
        }
      }

      if (!usable) {
        snapshotSequencer.invalidateQueries();
        // A revoked transaction is a replay of an older refunded purchase,
        // never the outcome of the live request — the live purchase settles
        // through its own delivery, error, or timeout.
        if (matchesPending && !isRevokedPurchase(purchase)) {
          settlePendingPurchase('failed');
        }
        void performStoreRefresh(true, false);
        await finishTransaction({ purchase, isConsumable: false }).catch(() => undefined);
        return;
      }

      if (!verified) {
        snapshotSequencer.invalidateQueries();
        processedPurchasesRef.current.delete(purchaseKey);
        if (matchesPending) {
          settlePendingPurchase('failed');
        }
        void performStoreRefresh(true, false);
        return;
      }

      const expirationDateMs = purchaseAccessExpirationDate(purchase);
      const isExpiredAnnual =
        purchase.productId === PRO_ANNUAL_PRODUCT_ID &&
        expirationDateMs !== null &&
        expirationDateMs <= Date.now();

      if (isExpiredAnnual) {
        snapshotSequencer.invalidateQueries();
        if (matchesPending) {
          settlePendingPurchase('failed');
        }
        void performStoreRefresh(true, false);
        await finishTransaction({ purchase, isConsumable: false }).catch(() => undefined);
        return;
      }

      const incomingSource: PaidProSource =
        purchase.productId === PRO_LIFETIME_PRODUCT_ID ? 'lifetime' : 'yearly';
      const paidSource = preferredDirectPurchaseSource(
        paidCacheRef.current?.source,
        incomingSource,
      );
      if (paidSource === 'lifetime' && incomingSource === 'yearly') {
        snapshotSequencer.invalidateQueries();
        if (mountedRef.current) {
          setAccessStatus('resolved_pro');
          setSource('lifetime');
        }
      } else {
        applyStoreSnapshot(
          {
            source: paidSource,
            annualExpirationDateMs: paidSource === 'yearly' ? expirationDateMs : null,
            lifetimeRevoked: false,
            checkedAt: new Date().toISOString(),
          },
          snapshotSequencer.invalidateQueries(),
        );
      }
      await finishTransaction({ purchase, isConsumable: false }).catch(() => undefined);

      if (paidSource !== incomingSource) {
        void performStoreRefresh(true, false);
      }

      if (matchesPending) {
        settlePendingPurchase('purchased');
      }
    },
    [
      applyStoreSnapshot,
      performStoreRefresh,
      settlePendingPurchase,
      snapshotSequencer,
    ],
  );

  const handlePurchaseError = useCallback(
    (purchaseError: unknown, requestedProductId: string) => {
      const pending = pendingPurchaseRef.current;
      if (!pending || requestedProductId !== pending.productId) {
        return;
      }

      settlePendingPurchase(purchaseOutcomeFromError(purchaseError));
    },
    [settlePendingPurchase],
  );

  useEffect(() => {
    mountedRef.current = true;

    if (!isStorePlatform(Platform.OS)) {
      applyAccess(paidCacheRef.current);
      return () => {
        mountedRef.current = false;
      };
    }

    const purchaseUpdateSubscription = purchaseUpdatedListener((purchase) => {
      void handlePurchaseUpdate(purchase);
    });
    void performStoreRefresh(true, true);

    return () => {
      snapshotSequencer.invalidateQueries();
      mountedRef.current = false;
      const pendingConnection = storeConnectionPromiseRef.current;
      purchaseUpdateSubscription.remove();
      if (pendingPurchaseRef.current) {
        clearTimeout(pendingPurchaseRef.current.timeout);
        pendingPurchaseRef.current.resolve('failed');
        pendingPurchaseRef.current = null;
      }
      if (storeConnectedRef.current) {
        storeConnectedRef.current = false;
        void endConnection().catch(() => undefined);
      } else if (pendingConnection) {
        void pendingConnection
          .then((connected) => {
            if (!mountedRef.current && connected) {
              storeConnectedRef.current = false;
              void endConnection().catch(() => undefined);
            }
          })
          .catch(() => undefined);
      }
    };
  }, [
    applyAccess,
    handlePurchaseUpdate,
    performStoreRefresh,
    snapshotSequencer,
  ]);

  useEffect(() => {
    if (!isStorePlatform(Platform.OS)) {
      return;
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !isRecordingPath(pathnameRef.current)) {
        void performStoreRefresh(false, false);
      }
    });
    return () => subscription.remove();
  }, [performStoreRefresh]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const scheduleNextCheck = () => {
      if (cancelled) {
        return;
      }

      const nextCheckAt = nextCachedPaidEntitlementCheckAt(paidCacheRef.current);
      if (nextCheckAt === null) {
        return;
      }

      const remainingMs = nextCheckAt - Date.now();
      if (remainingMs > MAX_ENTITLEMENT_TIMER_DELAY_MS) {
        timeout = setTimeout(scheduleNextCheck, MAX_ENTITLEMENT_TIMER_DELAY_MS);
        return;
      }

      timeout = setTimeout(() => {
        if (cancelled) {
          return;
        }

        if (isRecordingPath(pathnameRef.current)) {
          applyAccess(paidCacheRef.current);
          scheduleNextCheck();
          return;
        }

        void performStoreRefresh(true, false).finally(scheduleNextCheck);
      }, Math.max(0, remainingMs));
    };

    scheduleNextCheck();
    return () => {
      cancelled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [applyAccess, paidCacheRevision, performStoreRefresh]);

  useEffect(() => {
    const recording = isRecordingPath(pathname);
    const wasRecording = previousRecordingPathRef.current;
    previousRecordingPathRef.current = recording;

    if (isStorePlatform(Platform.OS) && wasRecording && !recording) {
      void performStoreRefresh(true, false);
    }
  }, [pathname, performStoreRefresh]);

  const purchase = useCallback(
    (product: StoreProduct | null, type: 'in-app' | 'subs'): Promise<PurchaseOutcome> => {
      if (
        !product ||
        !storeConnectedRef.current ||
        pendingPurchaseRef.current ||
        (Platform.OS === 'android' && type === 'subs' && !product.androidOfferToken)
      ) {
        return Promise.resolve('failed');
      }

      if (mountedRef.current) {
        setIsProcessing(true);
      }

      return new Promise<PurchaseOutcome>((resolve) => {
        const timeout = setTimeout(() => {
          if (pendingPurchaseRef.current?.productId === product.id) {
            settlePendingPurchase('failed');
          }
        }, PURCHASE_TIMEOUT_MS);
        pendingPurchaseRef.current = {
          productId: product.id,
          startedAtMs: Date.now(),
          resolve,
          timeout,
        };

        const purchaseRequest =
          Platform.OS === 'android'
            ? type === 'subs'
              ? requestPurchase({
                  request: {
                    google: {
                      skus: [product.id],
                      subscriptionOffers: [
                        { sku: product.id, offerToken: product.androidOfferToken! },
                      ],
                    },
                  },
                  type: 'subs',
                })
              : requestPurchase({
                  request: { google: { skus: [product.id] } },
                  type: 'in-app',
                })
            : type === 'subs'
              ? requestPurchase({ request: { apple: { sku: product.id } }, type: 'subs' })
              : requestPurchase({ request: { apple: { sku: product.id } }, type: 'in-app' });

        void purchaseRequest
          .then((result) => {
            const purchases = Array.isArray(result) ? result : result ? [result] : [];
            for (const completedPurchase of purchases) {
              void handlePurchaseUpdate(completedPurchase);
            }
          })
          .catch((purchaseError) => handlePurchaseError(purchaseError, product.id));
      });
    },
    [handlePurchaseError, handlePurchaseUpdate, settlePendingPurchase],
  );

  const restorePurchases = useCallback(async (): Promise<RestoreOutcome> => {
    if (!(await connectStore().catch(() => false))) {
      return 'failed';
    }

    if (mountedRef.current) {
      setIsProcessing(true);
    }

    try {
      if (Platform.OS === 'ios' && !(await syncIOS())) {
        throw new Error('The App Store could not synchronize purchases.');
      }
      await resolveGrandfathering(true);
      const paidSource = await queryAndApplyStoreEntitlements();
      return paidSource !== null || grandfatheringRef.current === 'eligible'
        ? 'restored'
        : 'empty';
    } catch {
      return 'failed';
    } finally {
      if (mountedRef.current) {
        setIsProcessing(false);
      }
    }
  }, [connectStore, queryAndApplyStoreEntitlements, resolveGrandfathering]);

  const manageSubscription = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        await deepLinkToSubscriptions({
          skuAndroid: PRO_ANNUAL_PRODUCT_ID,
          packageNameAndroid: Constants.expoConfig?.android?.package ?? 'com.trakio.mobile',
        });
      } catch {
        // The Play Store may be unavailable on devices without Google Play.
      }
      return;
    }

    if (Platform.OS !== 'ios') {
      return;
    }

    try {
      await showManageSubscriptionsIOS();
    } catch {
      await deepLinkToSubscriptions({});
    }
  }, []);

  const value = useMemo<EntitlementContextValue>(
    () => ({
      accessStatus,
      grandfatheringStatus,
      canResolveGrandfathering,
      hasProAccess: hasProAccessForStatus(accessStatus),
      source,
      annualProduct,
      lifetimeProduct,
      isStoreAvailable,
      isLoadingProducts,
      isProcessing,
      purchaseAnnual: () => purchase(annualProduct, 'subs'),
      purchaseLifetime: () => purchase(lifetimeProduct, 'in-app'),
      restorePurchases,
      refresh,
      manageSubscription,
    }),
    [
      accessStatus,
      annualProduct,
      canResolveGrandfathering,
      grandfatheringStatus,
      isLoadingProducts,
      isProcessing,
      isStoreAvailable,
      lifetimeProduct,
      manageSubscription,
      purchase,
      refresh,
      restorePurchases,
      source,
    ],
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlements(): EntitlementContextValue {
  const value = useContext(EntitlementContext);
  if (!value) {
    throw new Error('useEntitlements must be used inside EntitlementProvider.');
  }
  return value;
}
