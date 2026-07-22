import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import i18n from '@/i18n';
import { useEntitlements } from '@/contexts/EntitlementContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';

type PlanChoice = 'annual' | 'lifetime';

const BENEFITS = [
  { key: 'unlimitedSessions', icon: 'infinite-outline' },
  { key: 'pdfExport', icon: 'document-text-outline' },
  { key: 'csvExport', icon: 'grid-outline' },
] as const;

export default function ProScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const gradientColors = useHeaderGradient('violet');
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [selectedPlan, setSelectedPlan] = useState<PlanChoice>('annual');
  const storeActionInFlightRef = useRef(false);
  const {
    accessStatus,
    source,
    annualProduct,
    lifetimeProduct,
    isStoreAvailable,
    isLoadingProducts,
    isProcessing,
    purchaseAnnual,
    purchaseLifetime,
    restorePurchases,
    refresh,
    manageSubscription,
  } = useEntitlements();
  const hasResolvedPro = accessStatus === 'resolved_pro' || accessStatus === 'offline_grace';

  useEffect(() => {
    if (!annualProduct && lifetimeProduct) {
      setSelectedPlan('lifetime');
    }
  }, [annualProduct, lifetimeProduct]);

  async function handlePurchase() {
    if (storeActionInFlightRef.current) {
      return;
    }

    storeActionInFlightRef.current = true;
    try {
      const outcome = selectedPlan === 'annual'
        ? await purchaseAnnual()
        : await purchaseLifetime();

      if (outcome === 'purchased') {
        Alert.alert(i18n.t('pro.purchaseSuccessTitle'), i18n.t('pro.purchaseSuccessMessage'));
      } else if (outcome === 'deferred') {
        Alert.alert(i18n.t('pro.purchaseDeferredTitle'), i18n.t('pro.purchaseDeferredMessage'));
      } else if (outcome === 'failed') {
        Alert.alert(i18n.t('pro.purchaseFailedTitle'), i18n.t('pro.purchaseFailedMessage'));
      }
    } finally {
      storeActionInFlightRef.current = false;
    }
  }

  async function handleRestore() {
    if (storeActionInFlightRef.current) {
      return;
    }

    storeActionInFlightRef.current = true;
    try {
      const outcome = await restorePurchases();
      if (outcome === 'restored') {
        Alert.alert(i18n.t('pro.restoreSuccessTitle'), i18n.t('pro.restoreSuccessMessage'));
      } else if (outcome === 'empty') {
        Alert.alert(i18n.t('pro.restoreEmptyTitle'), i18n.t('pro.restoreEmptyMessage'));
      } else {
        Alert.alert(i18n.t('pro.restoreFailedTitle'), i18n.t('pro.restoreFailedMessage'));
      }
    } finally {
      storeActionInFlightRef.current = false;
    }
  }

  const selectedProduct = selectedPlan === 'annual' ? annualProduct : lifetimeProduct;
  const planOptions = [
    {
      id: 'annual' as const,
      product: annualProduct,
      title: i18n.t('pro.yearly'),
      note: i18n.t('pro.yearlyNote'),
    },
    {
      id: 'lifetime' as const,
      product: lifetimeProduct,
      title: i18n.t('pro.lifetime'),
      note: i18n.t('pro.lifetimeNote'),
    },
  ];
  const planLabel = source ? i18n.t(`pro.sources.${source}`) : i18n.t('pro.freePlan');

  return (
    <View className="flex-1 bg-zinc-50 dark:bg-zinc-900">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 20 }}
      >
        <LinearGradient
          colors={gradientColors}
          locations={[0, 0.55, 1]}
          style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 24 }}
        >
          <Pressable className="mb-5 h-9 w-9 items-center justify-center" onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={isDark ? '#d4d4d8' : '#3f3f46'} />
          </Pressable>
          <View className="h-12 w-12 items-center justify-center rounded-full bg-violet-500/15 dark:bg-violet-400/20">
            <Ionicons name="speedometer-outline" size={25} color="#8b5cf6" />
          </View>
          <Text className="mt-4 text-3xl font-bold text-zinc-900 dark:text-white">
            {i18n.t('pro.title')}
          </Text>
          <Text className="mt-2 max-w-lg text-sm leading-5 text-zinc-600 dark:text-zinc-300">
            {i18n.t('pro.subtitle')}
          </Text>
        </LinearGradient>

        <View className="flex-1 px-5 pt-5">
          <View className="gap-3">
            {BENEFITS.map(({ key, icon }) => (
              <View key={key} className="flex-row items-center gap-3">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-emerald-500/12">
                  <Ionicons name={icon} size={18} color="#10b981" />
                </View>
                <Text className="text-[15px] font-medium text-zinc-800 dark:text-zinc-100">
                  {i18n.t(`pro.benefits.${key}`)}
                </Text>
              </View>
            ))}
          </View>

          {hasResolvedPro ? (
            <View className="mt-7 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-xs font-medium uppercase text-emerald-600 dark:text-emerald-400">
                    {i18n.t('pro.currentPlan')}
                  </Text>
                  <Text className="mt-1 text-lg font-semibold text-zinc-900 dark:text-white">
                    {planLabel}
                  </Text>
                </View>
                <Ionicons name="checkmark-circle" size={28} color="#10b981" />
              </View>
              {accessStatus === 'offline_grace' ? (
                <Text className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                  {i18n.t('pro.offlineGrace')}
                </Text>
              ) : null}
              {source === 'yearly' ? (
                <Pressable className="mt-4 self-start" onPress={() => void manageSubscription()}>
                  <Text className="text-sm font-medium text-violet-600 dark:text-violet-400">
                    {i18n.t('pro.manageSubscription')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View className="mt-7 gap-3">
              {planOptions.map((plan) => (
                <Pressable
                  key={plan.id}
                  disabled={!plan.product || isLoadingProducts}
                  className={`border p-4 ${
                    plan.product && selectedPlan === plan.id
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5'
                  } disabled:opacity-50`}
                  onPress={() => setSelectedPlan(plan.id)}
                >
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-zinc-900 dark:text-white">
                        {plan.title}
                      </Text>
                      <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        {plan.note}
                      </Text>
                    </View>
                    <Text className="text-lg font-semibold text-zinc-900 dark:text-white">
                      {plan.product?.displayPrice ?? '-'}
                    </Text>
                  </View>
                </Pressable>
              ))}

              {!isLoadingProducts && !annualProduct && !lifetimeProduct ? (
                <View className="items-center py-2">
                  <Text className="text-center text-sm leading-5 text-zinc-500 dark:text-zinc-400">
                    {i18n.t('pro.offeringsUnavailable')}
                  </Text>
                  <Pressable
                    disabled={isProcessing}
                    className="mt-2 px-4 py-2 disabled:opacity-50"
                    onPress={() => void refresh()}
                  >
                    <Text className="text-sm font-medium text-violet-600 dark:text-violet-400">
                      {i18n.t('common.retry')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {isLoadingProducts || annualProduct || lifetimeProduct ? (
                <>
                  <Pressable
                    disabled={
                      !selectedProduct ||
                      !isStoreAvailable ||
                      isProcessing ||
                      isLoadingProducts
                    }
                    className="mt-1 h-14 items-center justify-center rounded-xl bg-violet-500 disabled:opacity-50"
                    onPress={() => void handlePurchase()}
                  >
                    {isProcessing ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text className="text-sm font-semibold text-white">
                        {isLoadingProducts ? i18n.t('common.loading') : i18n.t('pro.continue')}
                      </Text>
                    )}
                  </Pressable>

                  {selectedPlan === 'annual' && annualProduct ? (
                    <Text className="text-center text-xs leading-4 text-zinc-500 dark:text-zinc-400">
                      {i18n.t('pro.renewalDisclosure')}
                    </Text>
                  ) : null}
                </>
              ) : null}
            </View>
          )}

          <View className="mt-auto pt-8">
            <Pressable
              disabled={isProcessing}
              className="items-center py-3 disabled:opacity-50"
              onPress={() => void handleRestore()}
            >
              <Text className="text-sm font-medium text-violet-600 dark:text-violet-400">
                {i18n.t('pro.restore')}
              </Text>
            </Pressable>

            <View className="mt-2 flex-row justify-center gap-5">
              <Pressable className="py-2" onPress={() => router.push('/terms')}>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  {i18n.t('menu.termsOfUse')}
                </Text>
              </Pressable>
              <Pressable className="py-2" onPress={() => router.push('/privacy')}>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  {i18n.t('menu.privacyPolicy')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
