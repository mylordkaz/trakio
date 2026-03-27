import { useCallback, useEffect, useState } from 'react';
import { Alert, View, Text, ScrollView, TextInput, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import i18n from '@/i18n';
import StatusPill from '@/components/StatusPill';
import type { SessionListItem } from '@/db';
import { listSessions, deleteSession } from '@/db';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';

const FILTER_KEYS = ['sessions.all', 'sessions.recent', 'sessions.best'] as const;
const FILTER_VALUES = ['All', 'Recent', 'Best'] as const;

function formatSessionDate(value: string) {
  return new Date(value).toLocaleDateString(i18n.locale === 'ja' ? 'ja-JP' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatSessionTime(value: string) {
  return new Date(value).toLocaleTimeString(i18n.locale === 'ja' ? 'ja-JP' : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatLapTime(lapTimeMs: number | null) {
  if (lapTimeMs === null) {
    return '--:--.---';
  }

  const totalSeconds = lapTimeMs / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;

  return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
}

export default function SessionListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { trackId, trackName: trackNameParam } = useLocalSearchParams<{ trackId?: string; trackName?: string }>();
  const db = useSQLiteContext();
  const [activeFilter, setActiveFilter] = useState(0);
  const [activeTrackFilter, setActiveTrackFilter] = useState<string | null>(null);
  const [activeTrackFilterName, setActiveTrackFilterName] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const gradientColors = useHeaderGradient('violet');

  useEffect(() => {
    if (!trackId) {
      return;
    }

    setActiveTrackFilter(trackId);
    setActiveTrackFilterName(trackNameParam ?? null);
    router.replace('/(tabs)/sessions');
  }, [router, trackId]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      async function loadSessions() {
        try {
          setIsLoading(true);
          const nextSessions = await listSessions(db);

          if (!isMounted) {
            return;
          }

          setSessions(nextSessions);
          setLoadError(null);
        } catch {
          if (!isMounted) {
            return;
          }

          setLoadError(i18n.t('sessions.unableToLoadSession'));
        } finally {
          if (isMounted) {
            setIsLoading(false);
          }
        }
      }

      void loadSessions();

      return () => {
        isMounted = false;
        setActiveTrackFilter(null);
        setActiveTrackFilterName(null);
      };
    }, [db])
  );

  const filteredSessions = sessions.filter((session) => {
    const dateLabel = formatSessionDate(session.startedAt);
    const matchesTrack = !activeTrackFilter || session.trackId === activeTrackFilter;
    const matchesSearch =
      !search ||
      session.name.toLowerCase().includes(search.toLowerCase()) ||
      session.trackName.toLowerCase().includes(search.toLowerCase()) ||
      dateLabel.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      activeFilter === 0 ||
      session.displayStatus === FILTER_VALUES[activeFilter];

    return matchesTrack && matchesSearch && matchesFilter;
  });

  const activeTrackName = activeTrackFilter
    ? activeTrackFilterName ?? sessions.find((s) => s.trackId === activeTrackFilter)?.trackName ?? null
    : null;

  const handleDeleteSession = useCallback(
    (session: SessionListItem) => {
      Alert.alert(
        i18n.t('sessions.deleteTitle'),
        i18n.t('sessions.deleteMessage', { name: session.name }),
        [
          { text: i18n.t('common.cancel'), style: 'cancel' },
          {
            text: i18n.t('common.delete'),
            style: 'destructive',
            onPress: async () => {
              await deleteSession(db, session.id);
              setSessions((prev) => prev.filter((s) => s.id !== session.id));
            },
          },
        ]
      );
    },
    [db]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setActiveTrackFilter(null);
    setActiveTrackFilterName(null);
    setSearch('');
    setActiveFilter(0);
    try {
      const nextSessions = await listSessions(db);
      setSessions(nextSessions);
      setLoadError(null);
    } catch {
      setLoadError(i18n.t('sessions.unableToLoadSession'));
    } finally {
      setRefreshing(false);
    }
  }, [db]);

  return (
    <View className="flex-1 bg-zinc-50 dark:bg-zinc-900 overflow-hidden">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#8b5cf6" />
        }
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
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.header')}</Text>
            <Pressable onPress={() => setEditMode((prev) => !prev)}>
              <Text className="text-base font-medium text-violet-400">
                {editMode ? i18n.t('common.done') : i18n.t('common.edit')}
              </Text>
            </Pressable>
          </View>

          <View className="mb-5">
            <Text className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">{i18n.t('sessions.subtitle')}</Text>
            <Text className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">{i18n.t('sessions.title')}</Text>
          </View>

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

        {activeTrackFilter && activeTrackName ? (
          <View className="px-5 pt-3">
            <Pressable
              onPress={() => { setActiveTrackFilter(null); setActiveTrackFilterName(null); }}
              className="self-start flex-row items-center gap-1 rounded-full px-2.5 py-1 bg-zinc-200 dark:bg-white/10 border border-zinc-300 dark:border-white/10"
              accessibilityRole="button"
            >
              <Text className="text-xs text-zinc-600 dark:text-zinc-300">
                {i18n.t('sessions.trackFilterLabel', { name: activeTrackName })}
              </Text>
              <Ionicons name="close-circle" size={12} color={isDark ? '#a1a1aa' : '#71717a'} />
            </Pressable>
          </View>
        ) : null}

        <View className="px-5 py-4 gap-3">
          {isLoading ? (
            <View className="rounded-3xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-4">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.loadingSessions')}</Text>
            </View>
          ) : null}

          {loadError ? (
            <View className="rounded-3xl bg-red-500/10 border border-red-500/20 p-4">
              <Text className="text-sm text-red-700 dark:text-red-200">{loadError}</Text>
            </View>
          ) : null}

          {!isLoading && !loadError && filteredSessions.length === 0 ? (
            <View className="rounded-3xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-4">
              <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('sessions.noSessionsFound')}</Text>
              <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {i18n.t('sessions.noSessionsFoundHint')}
              </Text>
            </View>
          ) : null}

          {filteredSessions.map((session) => (
            <View key={session.id} className="flex-row items-center gap-3">
              <Pressable
                onPress={() => {
                  if (!editMode) {
                    router.push({ pathname: '/(tabs)/sessions/detail', params: { id: session.id } });
                  }
                }}
                className="flex-1 rounded-3xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-4"
              >
                <View className="flex-row justify-between items-start mb-3">
                  <View className="flex-1 mr-3">
                    <Text className="text-base font-semibold leading-tight text-zinc-900 dark:text-white">{session.name}</Text>
                    <Text className="text-sm text-zinc-500 dark:text-zinc-400">{session.trackName}</Text>
                  </View>
                  <StatusPill text={session.displayStatus} color="violet" />
                </View>
                <View className="flex-row gap-3 mb-3">
                  <View className="flex-1 rounded-2xl bg-zinc-50 dark:bg-black/20 border border-zinc-100 dark:border-white/5 px-3 py-2.5">
                    <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">{i18n.t('sessions.date')}</Text>
                    <Text className="text-sm font-medium text-zinc-900 dark:text-white">{formatSessionDate(session.startedAt)}</Text>
                  </View>
                  <View className="flex-1 rounded-2xl bg-zinc-50 dark:bg-black/20 border border-zinc-100 dark:border-white/5 px-3 py-2.5">
                    <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">{i18n.t('sessions.startTime')}</Text>
                    <Text className="text-sm font-medium text-zinc-900 dark:text-white">{formatSessionTime(session.startedAt)}</Text>
                  </View>
                </View>
                <View className="flex-row items-center justify-between rounded-2xl bg-zinc-50 dark:bg-black/20 border border-zinc-100 dark:border-white/5 px-3 py-2.5">
                  <View>
                    <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">{i18n.t('session.bestLap')}</Text>
                    <Text className="text-sm font-semibold text-zinc-900 dark:text-white">{formatLapTime(session.bestLapMs)}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">{i18n.t('sessions.laps')}</Text>
                    <Text className="text-sm font-semibold text-zinc-900 dark:text-white">{session.totalLaps}</Text>
                  </View>
                </View>
              </Pressable>
              {editMode ? (
                <Pressable onPress={() => handleDeleteSession(session)}>
                  <Ionicons name="remove-circle" size={24} color="#ef4444" />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>

        {/* TODO: Export not yet implemented
        <View className="px-5 pb-5 pt-1">
          <Pressable className="w-full rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 py-3.5 items-center">
            <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('sessions.exportSessions')}</Text>
          </Pressable>
        </View>
        */}
      </ScrollView>
    </View>
  );
}
