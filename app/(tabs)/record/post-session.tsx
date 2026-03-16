import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import i18n from '@/i18n';
import Card from '@/components/Card';
import LapBreakdown from '@/components/LapBreakdown';
import type { LapBreakdownItem } from '@/components/LapBreakdown';
import ProgressBar from '@/components/ProgressBar';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';

const MOCK_LAPS: LapBreakdownItem[] = [
  { lap: 1, time: '1:54.238', timeMs: 114238, delta: '+5.467', sectors: ['32.184', '43.102', '38.952'], sectorMs: [32184, 43102, 38952] },
  { lap: 2, time: '1:49.914', timeMs: 109914, delta: '+1.143', sectors: ['31.902', '41.890', '36.122'], sectorMs: [31902, 41890, 36122] },
  { lap: 3, time: '1:48.771', timeMs: 108771, delta: null, sectors: ['31.842', '41.317', '35.612'], sectorMs: [31842, 41317, 35612] },
  { lap: 4, time: '1:49.102', timeMs: 109102, delta: '+0.331', sectors: ['32.011', '41.580', '35.511'], sectorMs: [32011, 41580, 35511] },
];

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
              {[
                { label: 'S1', time: '31.842' },
                { label: 'S2', time: '41.317' },
                { label: 'S3', time: '35.612' },
              ].map((s) => (
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

          {/* Session Insights */}
          <Card>
            <View className="mb-4">
              <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('sessions.sessionInsights')}</Text>
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.performanceSummary')}</Text>
            </View>

            {/* Consistency */}
            <View className="mb-4">
              <ProgressBar label={i18n.t('postSession.consistency')} value="91%" color="bg-white dark:bg-white" />
            </View>

            {/* Theoretical Best */}
            <View className="mb-4">
              <View className="flex-row justify-between mb-1">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.theoreticalBest')}</Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">1:47.670</Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="flex-1 h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
                  <View className="h-full rounded-full bg-emerald-400" style={{ width: '96%' }} />
                </View>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.gap', { gap: '1.101' })}</Text>
              </View>
              <Text className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{i18n.t('sessions.bestSectorsCombined')}</Text>
            </View>

            {/* Lap Delta Trend */}
            <View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.lapDeltaTrend')}</Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.avgPerLap', { delta: '−0.8s' })}</Text>
              </View>
              <View className="flex-row gap-1.5 items-end h-16">
                {[
                  { lap: 1, height: 85, best: false },
                  { lap: 2, height: 65, best: false },
                  { lap: 3, height: 100, best: true },
                  { lap: 4, height: 70, best: false },
                ].map((bar) => (
                  <View key={bar.lap} className="flex-1 items-center">
                    <View
                      className={`w-full rounded-md ${bar.best ? 'bg-emerald-400' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                      style={{ height: `${bar.height}%` }}
                    />
                  </View>
                ))}
              </View>
              <View className="flex-row justify-between mt-1">
                <Text className="text-xs text-zinc-400 dark:text-zinc-500">{i18n.t('sessions.lapLabel', { number: 1 })}</Text>
                <Text className="text-xs text-zinc-400 dark:text-zinc-500">{i18n.t('sessions.lapLabel', { number: 4 })}</Text>
              </View>
            </View>
          </Card>

          {/* Lap Breakdown */}
          <LapBreakdown laps={MOCK_LAPS} accentColor="emerald" />
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
