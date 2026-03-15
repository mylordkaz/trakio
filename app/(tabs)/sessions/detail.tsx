import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import i18n from '@/i18n';
import StatusPill from '@/components/StatusPill';
import Card from '@/components/Card';
import LapRow from '@/components/LapRow';
import ProgressBar from '@/components/ProgressBar';
import { LAP_DATA } from '@/constants/data';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';

const SECTORS = [
  { label: 'S1', value: '31.842', status: 'Best' },
  { label: 'S2', value: '41.317', status: 'Best' },
  { label: 'S3', value: '34.511', status: 'Best' },
];

const METRICS = [
  { label: 'Top Speed', value: '214 km/h' },
  { label: 'Duration', value: '18:42' },
  { label: 'Total Laps', value: '12' },
];

export default function SessionDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const gradientColors = useHeaderGradient('violet');

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
            <Pressable onPress={() => router.back()}>
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('common.back')}</Text>
            </Pressable>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">Fuji Speedway</Text>
          </View>

          {/* Title + status */}
          <View className="flex-row items-start justify-between mb-5">
            <View className="flex-1 mr-3">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">Recorded Session</Text>
              <Text className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Track Day · Session 2</Text>
              <Text className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Mar 10, 2026 · 10:24 AM</Text>
            </View>
            <StatusPill text="Best Run" color="violet" />
          </View>

          {/* Circuit view card */}
          <View className="rounded-3xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10 p-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">Circuit View</Text>
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">Record Line</Text>
            </View>
            <View className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-zinc-200 dark:bg-zinc-950/80 p-4 mb-3 h-40 items-center justify-center">
              <Text className="text-zinc-400 dark:text-zinc-500 text-sm">Track Map with Racing Line</Text>
            </View>
            <View className="flex-row gap-2">
              {SECTORS.map((s) => (
                <View key={s.label} className="flex-1 rounded-2xl p-3 border bg-violet-500/10 border-violet-400/20">
                  <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{s.label}</Text>
                  <Text className="text-lg font-medium text-zinc-900 dark:text-white">{s.value}</Text>
                </View>
              ))}
            </View>
            <View className="flex-row items-center justify-between mt-3">
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">Green = start / finish</Text>
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">Purple = fastest line</Text>
            </View>
          </View>
        </LinearGradient>

        <View className="px-5 py-4 gap-4">
          {/* Metrics row */}
          <View className="flex-row gap-3">
            {METRICS.map((m) => (
              <View key={m.label} className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{m.label}</Text>
                <Text className="text-lg font-semibold text-zinc-900 dark:text-white">{m.value}</Text>
              </View>
            ))}
          </View>

          {/* Session Insights */}
          <Card>
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-sm font-medium text-zinc-900 dark:text-white">Session Insights</Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">Quick performance summary</Text>
              </View>
              <Text className="text-sm text-violet-600 dark:text-violet-300">+1.2s vs last</Text>
            </View>
            <View className="gap-3">
              <ProgressBar label={i18n.t('postSession.consistency')} value="91%" />
              <ProgressBar label={i18n.t('postSession.throttleAvg')} value="76%" />
              <ProgressBar label={i18n.t('postSession.brakingEfficiency')} value="88%" color="bg-violet-400" />
            </View>
          </Card>

          {/* Lap Breakdown */}
          <Card>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('postSession.lapBreakdown')}</Text>
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">Compare</Text>
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
            <Text className="text-sm font-medium text-zinc-900 dark:text-white">Export Data</Text>
          </Pressable>
          <Pressable className="flex-1 rounded-2xl bg-violet-500 py-3.5 items-center">
            <Text className="text-sm font-semibold text-white">View Replay</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
