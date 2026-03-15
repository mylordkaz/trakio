import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import i18n from '@/i18n';
import StatusPill from '@/components/StatusPill';
import Card from '@/components/Card';
import { CIRCUITS } from '@/constants/data';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';

const STATS = [
  { label: 'Length', value: '4.563 km' },
  { label: 'Corners', value: '16' },
  { label: 'Direction', value: 'Clockwise' },
];

const SECTORS = [
  { label: 'Sector 1', value: '1.42 km' },
  { label: 'Sector 2', value: '1.68 km' },
  { label: 'Sector 3', value: '1.46 km' },
];

const NOTES = [
  'Long main straight with heavy braking into Turn 1',
  'Technical middle sector with quick direction changes',
  'Final sector rewards clean exits and throttle control',
];

export default function CircuitDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name: string }>();
  const circuit = CIRCUITS.find((c) => c.name === name) ?? CIRCUITS[0];
  const gradientColors = useHeaderGradient('sky');

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
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">Track Details</Text>
          </View>

          {/* Title + status */}
          <View className="flex-row items-start justify-between mb-5">
            <View className="flex-1 mr-3">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">Circuit Profile</Text>
              <Text className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">{circuit.name}</Text>
              <Text className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{circuit.country}</Text>
            </View>
            <StatusPill text="FIA Grade 1" color="sky" />
          </View>

          {/* Track layout card */}
          <View className="rounded-3xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10 p-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('circuits.trackLayout')}</Text>
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('circuits.fullCourse')}</Text>
            </View>
            <View className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-zinc-200 dark:bg-zinc-950/80 p-5 mb-3 h-36 items-center justify-center">
              <Text className="text-zinc-400 dark:text-zinc-500 text-sm">Track Map</Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">Start / Finish</Text>
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">Pit Entry at final corner</Text>
            </View>
          </View>
        </LinearGradient>

        <View className="px-5 py-4 gap-4">
          {/* Stats row */}
          <View className="flex-row gap-3">
            {STATS.map((s) => (
              <View key={s.label} className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{s.label}</Text>
                <Text className="text-sm font-semibold text-zinc-900 dark:text-white">{s.value}</Text>
              </View>
            ))}
          </View>

          {/* Sector Breakdown */}
          <Card>
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('circuits.sectorBreakdown')}</Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">Distance split across the lap</Text>
              </View>
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">Compare</Text>
            </View>
            <View className="gap-2">
              {SECTORS.map((s, i) => (
                <View
                  key={s.label}
                  className={`flex-row items-center justify-between rounded-2xl px-3 py-2.5 border ${
                    i === 0 ? 'bg-sky-500/10 border-sky-400/20' : 'bg-zinc-50 dark:bg-black/20 border-zinc-100 dark:border-white/5'
                  }`}
                >
                  <Text className="text-sm text-zinc-900 dark:text-white">{s.label}</Text>
                  <Text className="text-sm font-medium text-zinc-900 dark:text-white">{s.value}</Text>
                </View>
              ))}
            </View>
          </Card>

          {/* Driver Notes */}
          <Card>
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-sm font-medium text-zinc-900 dark:text-white">Driver Notes</Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">Quick reference before the session</Text>
              </View>
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('common.edit')}</Text>
            </View>
            <View className="gap-2">
              {NOTES.map((n) => (
                <View key={n} className="rounded-2xl bg-zinc-50 dark:bg-black/20 px-3 py-2.5 border border-zinc-100 dark:border-white/5">
                  <Text className="text-sm text-zinc-700 dark:text-zinc-200">{n}</Text>
                </View>
              ))}
            </View>
          </Card>
        </View>

        {/* Bottom buttons */}
        <View className="px-5 pb-5 pt-1 flex-row gap-3">
          <Pressable className="flex-1 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 py-3.5 items-center">
            <Text className="text-sm font-medium text-zinc-900 dark:text-white">View History</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(tabs)/record')}
            className="flex-1 rounded-2xl bg-sky-500 py-3.5 items-center"
          >
            <Text className="text-sm font-semibold text-black">{i18n.t('session.start')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
