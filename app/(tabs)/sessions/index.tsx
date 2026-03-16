import { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import i18n from '@/i18n';
import StatusPill from '@/components/StatusPill';
import { SESSIONS } from '@/constants/data';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';

const FILTER_KEYS = ['sessions.all', 'sessions.recent', 'sessions.best'] as const;
const FILTER_VALUES = ['All', 'Recent', 'Best'];

export default function SessionListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState(0);
  const [search, setSearch] = useState('');
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const gradientColors = useHeaderGradient('violet');

  const filteredSessions = SESSIONS.filter((session) => {
    const matchesSearch =
      !search ||
      session.name.toLowerCase().includes(search.toLowerCase()) ||
      session.track.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      activeFilter === 0 ||
      session.status === FILTER_VALUES[activeFilter];
    return matchesSearch && matchesFilter;
  });

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
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.header')}</Text>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.runs', { count: 57 })}</Text>
          </View>

          <View className="mb-5">
            <Text className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">{i18n.t('sessions.subtitle')}</Text>
            <Text className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">{i18n.t('sessions.title')}</Text>
          </View>

          {/* Search + Filters */}
          <View className="rounded-3xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10 p-3">
            <View className="flex-row items-center gap-3 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-4 py-3">
              <Ionicons name="search" size={16} color={isDark ? '#a1a1aa' : '#71717a'} />
              <TextInput
                style={{ flex: 1, fontSize: 14, color: isDark ? '#fff' : '#18181b', padding: 0 }}
                placeholder={i18n.t('sessions.searchPlaceholder')}
                placeholderTextColor={isDark ? '#a1a1aa' : '#71717a'}
                value={search}
                onChangeText={setSearch}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingTop: 12 }}
            >
              {FILTER_KEYS.map((key, index) => (
                <Pressable
                  key={key}
                  onPress={() => setActiveFilter(index)}
                  className={`rounded-full px-3 py-1.5 border ${
                    activeFilter === index
                      ? 'bg-violet-500 border-violet-400'
                      : 'bg-zinc-200 dark:bg-white/10 border-zinc-200 dark:border-white/10'
                  }`}
                >
                  <Text
                    className={`text-sm ${
                      activeFilter === index ? 'text-white' : 'text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    {i18n.t(key)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </LinearGradient>

        {/* Session Cards */}
        <View className="px-5 py-4 gap-3">
          {filteredSessions.map((s) => (
            <Pressable
              key={`${s.name}-${s.date}`}
              onPress={() => router.push({ pathname: '/(tabs)/sessions/detail', params: { track: s.track, date: s.date } })}
              className="w-full rounded-3xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-4"
            >
              <View className="flex-row justify-between items-start mb-3">
                <View className="flex-1 mr-3">
                  <Text className="text-base font-semibold leading-tight text-zinc-900 dark:text-white">{s.name}</Text>
                  <Text className="text-sm text-zinc-500 dark:text-zinc-400">{s.track}</Text>
                </View>
                <StatusPill text={s.status} color="violet" />
              </View>
              <View className="flex-row gap-3 mb-3">
                <View className="flex-1 rounded-2xl bg-zinc-50 dark:bg-black/20 border border-zinc-100 dark:border-white/5 px-3 py-2.5">
                  <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">{i18n.t('sessions.date')}</Text>
                  <Text className="text-sm font-medium text-zinc-900 dark:text-white">{s.date}</Text>
                </View>
                <View className="flex-1 rounded-2xl bg-zinc-50 dark:bg-black/20 border border-zinc-100 dark:border-white/5 px-3 py-2.5">
                  <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">{i18n.t('sessions.startTime')}</Text>
                  <Text className="text-sm font-medium text-zinc-900 dark:text-white">{s.time}</Text>
                </View>
              </View>
              <View className="flex-row items-center justify-between rounded-2xl bg-zinc-50 dark:bg-black/20 border border-zinc-100 dark:border-white/5 px-3 py-2.5">
                <View>
                  <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">{i18n.t('session.bestLap')}</Text>
                  <Text className="text-sm font-semibold text-zinc-900 dark:text-white">{s.bestLap}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">{i18n.t('sessions.laps')}</Text>
                  <Text className="text-sm font-semibold text-zinc-900 dark:text-white">{s.laps}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Export button */}
        <View className="px-5 pb-5 pt-1">
          <Pressable className="w-full rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 py-3.5 items-center">
            <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('sessions.exportSessions')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
