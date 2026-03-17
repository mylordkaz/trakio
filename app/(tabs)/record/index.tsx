import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import i18n from '@/i18n';
import Card from '@/components/Card';
import { CIRCUITS } from '@/constants/data';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';

const CHECKLIST = [
  { key: 'gpsLock', value: i18n.t('telemetry.strong') },
  { key: 'battery', value: '92%' },
  { key: 'startFinishLineSet', value: i18n.t('common.ok') },
] as const;

export default function PreSessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedCircuit, setSelectedCircuit] = useState(CIRCUITS[0]);
  const [showCircuitPicker, setShowCircuitPicker] = useState(false);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const gradientColors = useHeaderGradient('emerald');
  const sessionNumber = 3; // TODO: derive from DB
  const sessionTitle = i18n.t('preSession.sessionTitle', { number: sessionNumber });

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
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('preSession.title')}</Text>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">12:12 PM</Text>
          </View>

          {/* Title + READY badge */}
          <View className="flex-row items-start justify-between mb-5">
            <View className="flex-1 mr-3">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('preSession.readyToRecord')}</Text>
              <Text className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">{sessionTitle}</Text>
            </View>
            <View className="flex-row items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 border border-emerald-400/20">
              <View className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <Text className="text-sm text-emerald-400">{i18n.t('session.ready')}</Text>
            </View>
          </View>

          {/* Track Selection */}
          <View className="rounded-3xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10 p-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('preSession.selectedCircuit')}</Text>
              <Pressable onPress={() => setShowCircuitPicker(!showCircuitPicker)}>
                <Text className="text-sm font-medium text-emerald-400">
                  {showCircuitPicker ? i18n.t('common.done') : i18n.t('common.change')}
                </Text>
              </Pressable>
            </View>

            {!showCircuitPicker ? (
              <Pressable onPress={() => setShowCircuitPicker(true)}>
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">{selectedCircuit.name}</Text>
                    <Text className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {selectedCircuit.country} · {selectedCircuit.length} · {i18n.t('preSession.cornersCount', { count: selectedCircuit.corners })}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#71717a" />
                </View>
                <View className="flex-row gap-2 mt-3">
                  <View className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 py-2">
                    <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-0.5">{i18n.t('preSession.lastVisit')}</Text>
                    <Text className="text-sm font-medium text-zinc-900 dark:text-white">Mar 10, 2026</Text>
                  </View>
                  <View className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 py-2">
                    <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-0.5">{i18n.t('session.bestLap')}</Text>
                    <Text className="text-sm font-medium text-zinc-900 dark:text-white">1:48.771</Text>
                  </View>
                </View>
              </Pressable>
            ) : (
              <View className="gap-2">
                {CIRCUITS.map((c) => (
                  <Pressable
                    key={c.name}
                    onPress={() => { setSelectedCircuit(c); setShowCircuitPicker(false); }}
                    className={`flex-row items-center justify-between rounded-2xl px-3 py-2.5 border ${
                      selectedCircuit.name === c.name
                        ? 'bg-emerald-500/10 border-emerald-400/30'
                        : 'bg-zinc-100 dark:bg-white/5 border-zinc-200 dark:border-white/10'
                    }`}
                  >
                    <View>
                      <Text className="text-sm font-medium text-zinc-900 dark:text-white">{c.name}</Text>
                      <Text className="text-xs text-zinc-400 dark:text-zinc-500">{c.length} · {i18n.t('preSession.cornersCount', { count: c.corners })}</Text>
                    </View>
                    {selectedCircuit.name === c.name && (
                      <Ionicons name="checkmark" size={16} color="#34d399" />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Start button */}
          <View className="mt-4">
            <Pressable
              onPress={() => router.push('/(tabs)/record/recording')}
              className="w-full rounded-2xl bg-emerald-500 py-4 items-center"
            >
              <Text className="text-sm font-semibold text-black">
                {i18n.t('session.start')}
              </Text>
            </Pressable>
          </View>
        </LinearGradient>

        <View className="px-5 py-4 gap-4">
          {/* Conditions */}
          <View className="flex-row gap-3">
            <View className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3">
              <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{i18n.t('preSession.condition')}</Text>
              <Text className="text-2xl mb-1">☀️</Text>
              <Text className="text-sm font-semibold text-zinc-900 dark:text-white">{i18n.t('preSession.clear')}</Text>
            </View>
            <View className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3">
              <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{i18n.t('preSession.airTemp')}</Text>
              <Text className="text-lg font-semibold text-zinc-900 dark:text-white">24°C</Text>
            </View>
            <View className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3">
              <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{i18n.t('preSession.wind')}</Text>
              <Text className="text-lg font-semibold text-zinc-900 dark:text-white">14 km/h</Text>
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">NW</Text>
            </View>
          </View>

          {/* Session Checklist */}
          <Card>
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('preSession.sessionChecklist')}</Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('preSession.checklistSubtitle')}</Text>
              </View>
              <Text className="text-sm text-emerald-400">{i18n.t('preSession.allReady', { count: 3, total: 3 })}</Text>
            </View>
            <View className="gap-2">
              {CHECKLIST.map((item) => (
                <View key={item.key} className="flex-row items-center justify-between rounded-2xl bg-zinc-50 dark:bg-black/20 px-3 py-2.5 border border-zinc-100 dark:border-white/5">
                  <Text className="text-sm text-zinc-900 dark:text-white">{i18n.t(`preSession.${item.key}`)}</Text>
                  <Text className="text-sm font-medium text-emerald-400">{item.value}</Text>
                </View>
              ))}
            </View>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
