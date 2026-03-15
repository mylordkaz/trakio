import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import i18n from '@/i18n';
import Card from '@/components/Card';
import LapRow from '@/components/LapRow';
import ProgressBar from '@/components/ProgressBar';
import { LAP_DATA, SECTOR_HIGHLIGHTS } from '@/constants/data';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';

export default function PostSessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const gradientColors = useHeaderGradient('emerald');

  return (
    <View className="flex-1 bg-zinc-50 dark:bg-zinc-900 overflow-hidden">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={gradientColors}
          locations={[0, 0.5, 1]}
          style={{
            paddingTop: insets.top + 20,
            paddingHorizontal: 20,
            paddingBottom: 16,
          }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">Fuji Speedway</Text>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">12:41 PM</Text>
          </View>

          {/* Title + SAVED badge */}
          <View className="flex-row items-start justify-between mb-5">
            <View className="flex-1 mr-3">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('postSession.title')}</Text>
              <Text className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Track Day · Session 2</Text>
            </View>
            <View className="flex-row items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 border border-emerald-400/20">
              <View className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <Text className="text-sm text-emerald-400">{i18n.t('session.saved')}</Text>
            </View>
          </View>

          {/* Best lap card */}
          <View className="rounded-3xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10 p-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('session.bestLap')}</Text>
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('session.lapCount', { count: 3 })}</Text>
            </View>
            <Text
              className="text-zinc-900 dark:text-white mb-3"
              style={{ fontSize: 56, lineHeight: 56, fontWeight: '600', fontVariant: ['tabular-nums'] }}
            >
              1:48.771
            </Text>
            <View className="flex-row gap-2">
              {SECTOR_HIGHLIGHTS.map((s) => (
                <View key={s.label} className="flex-1 rounded-2xl p-3 border bg-emerald-500/10 border-emerald-400/30">
                  <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{s.label}</Text>
                  <Text className="text-lg font-medium text-zinc-900 dark:text-white">{s.time}</Text>
                </View>
              ))}
            </View>
          </View>
        </LinearGradient>

        <View className="px-5 py-4 gap-4">
          {/* Stats row */}
          <View className="flex-row gap-3">
            {[
              [i18n.t('session.topSpeed'), '214 km/h'],
              [i18n.t('session.duration'), '18:42'],
              [i18n.t('session.totalLaps'), '4'],
            ].map(([l, v]) => (
              <View key={l} className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{l}</Text>
                <Text className="text-lg font-semibold text-zinc-900 dark:text-white">{v}</Text>
              </View>
            ))}
          </View>

          {/* Session Overview */}
          <Card>
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('postSession.sessionOverview')}</Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('postSession.performanceSummary')}</Text>
              </View>
              <Text className="text-sm text-emerald-400">{i18n.t('postSession.personalBest')}</Text>
            </View>
            <View className="gap-3">
              <ProgressBar label={i18n.t('postSession.consistency')} value="91%" />
              <ProgressBar label={i18n.t('postSession.throttleAvg')} value="76%" />
              <ProgressBar label={i18n.t('postSession.brakingEfficiency')} value="88%" color="bg-emerald-400" />
            </View>
          </Card>

          {/* Lap Breakdown */}
          <Card>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('postSession.lapBreakdown')}</Text>
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('postSession.export')}</Text>
            </View>
            <View className="gap-2">
              {LAP_DATA.map((item) => (
                <LapRow key={item.lap} item={item} />
              ))}
            </View>
          </Card>
        </View>

        {/* Bottom buttons */}
        <View className="px-5 pb-5 pt-1 flex-row gap-3">
          <Pressable className="flex-1 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 py-3.5 items-center">
            <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('session.saveNotes')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace('/(tabs)/record')}
            className="flex-1 rounded-2xl bg-emerald-500 py-3.5 items-center"
          >
            <Text className="text-sm font-semibold text-black">{i18n.t('session.newSession')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
