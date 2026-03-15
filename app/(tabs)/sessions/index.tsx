import { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import i18n from '@/i18n';
import StatusPill from '@/components/StatusPill';
import { SESSIONS } from '@/constants/data';

const FILTERS = ['All', 'Recent', 'Best', 'Saved'];

export default function SessionListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState(0);
  const [search, setSearch] = useState('');

  const filteredSessions = SESSIONS.filter((session) => {
    const matchesSearch =
      !search ||
      session.track.toLowerCase().includes(search.toLowerCase()) ||
      session.layout.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      activeFilter === 0 ||
      session.status === FILTERS[activeFilter];
    return matchesSearch && matchesFilter;
  });

  return (
    <View className="flex-1 bg-zinc-900 overflow-hidden">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['rgba(139,92,246,0.15)', '#18181b', '#18181b']}
          locations={[0, 0.5, 1]}
          style={{
            paddingTop: insets.top + 20,
            paddingHorizontal: 20,
            paddingBottom: 16,
          }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xs text-zinc-400">{i18n.t('sessions.title').split(' ')[0]}</Text>
            <Text className="text-xs text-zinc-400">{i18n.t('sessions.runs', { count: 57 })}</Text>
          </View>

          <View className="mb-5">
            <Text className="text-sm text-zinc-400 mb-1">{i18n.t('sessions.subtitle')}</Text>
            <Text className="text-2xl font-semibold tracking-tight text-white">{i18n.t('sessions.title')}</Text>
          </View>

          {/* Search + Filters */}
          <View className="rounded-3xl bg-black/40 border border-white/10 p-3">
            <View className="flex-row items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
              <Ionicons name="search" size={16} color="#a1a1aa" />
              <TextInput
                style={{ flex: 1, fontSize: 14, color: '#ffffff', padding: 0 }}
                placeholder={i18n.t('sessions.searchPlaceholder')}
                placeholderTextColor="#a1a1aa"
                value={search}
                onChangeText={setSearch}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingTop: 12 }}
            >
              {FILTERS.map((filter, index) => (
                <Pressable
                  key={filter}
                  onPress={() => setActiveFilter(index)}
                  className={`rounded-full px-3 py-1.5 border ${
                    activeFilter === index
                      ? 'bg-violet-500 border-violet-400'
                      : 'bg-white/10 border-white/10'
                  }`}
                >
                  <Text
                    className={`text-sm ${
                      activeFilter === index ? 'text-white' : 'text-zinc-300'
                    }`}
                  >
                    {filter}
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
              key={`${s.track}-${s.date}`}
              onPress={() => router.push({ pathname: '/(tabs)/sessions/detail', params: { track: s.track, date: s.date } })}
              className="w-full rounded-3xl bg-white/5 border border-white/10 p-4"
            >
              <View className="flex-row justify-between items-start mb-3">
                <View className="flex-1 mr-3">
                  <Text className="text-base font-semibold leading-tight text-white">{s.track}</Text>
                  <Text className="text-sm text-zinc-400">{s.layout}</Text>
                </View>
                <StatusPill text={s.status} color="violet" />
              </View>
              <View className="flex-row gap-3 mb-3">
                <View className="flex-1 rounded-2xl bg-black/20 border border-white/5 px-3 py-2.5">
                  <Text className="text-xs text-zinc-500 mb-1">{i18n.t('sessions.date')}</Text>
                  <Text className="text-sm font-medium text-white">{s.date}</Text>
                </View>
                <View className="flex-1 rounded-2xl bg-black/20 border border-white/5 px-3 py-2.5">
                  <Text className="text-xs text-zinc-500 mb-1">{i18n.t('sessions.startTime')}</Text>
                  <Text className="text-sm font-medium text-white">{s.time}</Text>
                </View>
              </View>
              <View className="flex-row items-center justify-between rounded-2xl bg-black/20 border border-white/5 px-3 py-2.5">
                <View>
                  <Text className="text-xs text-zinc-500 mb-1">{i18n.t('session.bestLap')}</Text>
                  <Text className="text-sm font-semibold text-white">{s.bestLap}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-xs text-zinc-500 mb-1">{i18n.t('sessions.laps')}</Text>
                  <Text className="text-sm font-semibold text-white">{s.laps}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Export button */}
        <View className="px-5 pb-5 pt-1">
          <Pressable className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 items-center">
            <Text className="text-sm font-medium text-white">Export Sessions</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
