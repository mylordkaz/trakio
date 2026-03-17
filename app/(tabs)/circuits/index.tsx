import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import i18n from '@/i18n';
import StatusPill from '@/components/StatusPill';
import type { TrackListItem } from '@/db';
import { listTracks, listRecentTracks } from '@/db';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';

const FILTER_KEYS = ['circuits.all', 'circuits.recent'] as const;

function formatTrackLength(lengthMeters: number | null) {
  if (lengthMeters === null) {
    return i18n.t('common.tbd');
  }

  return `${(lengthMeters / 1000).toFixed(3)} km`;
}

export default function CircuitsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();
  const [activeFilter, setActiveFilter] = useState(0);
  const [search, setSearch] = useState('');
  const [circuits, setCircuits] = useState<TrackListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const gradientColors = useHeaderGradient('sky');

  useEffect(() => {
    let isMounted = true;

    async function loadCircuits() {
      try {
        setIsLoading(true);
        const nextCircuits = activeFilter === 1
          ? await listRecentTracks(db)
          : await listTracks(db);

        if (!isMounted) {
          return;
        }

        setCircuits(nextCircuits);
        setLoadError(null);
      } catch {
        if (!isMounted) {
          return;
        }

        setLoadError(i18n.t('circuits.loadError'));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadCircuits();

    return () => {
      isMounted = false;
    };
  }, [db, activeFilter]);

  const filteredCircuits = circuits.filter((circuit) => {
    return (
      !search ||
      circuit.name.toLowerCase().includes(search.toLowerCase()) ||
      circuit.country?.toLowerCase().includes(search.toLowerCase()) ||
      circuit.location?.toLowerCase().includes(search.toLowerCase()) ||
      circuit.layoutName?.toLowerCase().includes(search.toLowerCase())
    );
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
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('circuits.header')}</Text>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('circuits.trackCount', { count: circuits.length })}</Text>
          </View>

          <View className="mb-5">
            <Text className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">{i18n.t('circuits.subtitle')}</Text>
            <Text className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">{i18n.t('circuits.title')}</Text>
          </View>

          <View className="rounded-3xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10 p-3">
            <View className="flex-row items-center gap-3 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-4 py-3">
              <Ionicons name="search" size={16} color={isDark ? '#a1a1aa' : '#71717a'} />
              <TextInput
                style={{ flex: 1, fontSize: 14, color: isDark ? '#fff' : '#18181b', padding: 0 }}
                placeholder={i18n.t('circuits.searchPlaceholder')}
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
                      ? 'bg-sky-500 border-sky-400'
                      : 'bg-zinc-200 dark:bg-white/10 border-zinc-200 dark:border-white/10'
                  }`}
                >
                  <Text
                    className={`text-sm ${
                      activeFilter === index ? 'text-black' : 'text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    {i18n.t(key)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </LinearGradient>

        <View className="px-5 py-4 gap-3">
          {isLoading ? (
            <View className="rounded-3xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-4">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('circuits.loadingTracks')}</Text>
            </View>
          ) : null}

          {loadError ? (
            <View className="rounded-3xl bg-red-500/10 border border-red-500/20 p-4">
              <Text className="text-sm text-red-700 dark:text-red-200">{loadError}</Text>
            </View>
          ) : null}

          {!isLoading && !loadError && filteredCircuits.length === 0 ? (
            <View className="rounded-3xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-4">
              <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('circuits.noTracksFound')}</Text>
              <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {i18n.t('circuits.noTracksFoundHint')}
              </Text>
            </View>
          ) : null}

          {filteredCircuits.map((circuit) => (
            <Pressable
              key={circuit.id}
              onPress={() => router.push({ pathname: '/(tabs)/circuits/detail', params: { id: circuit.id } })}
              className="w-full rounded-3xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-4"
            >
              <View className="flex-row justify-between items-start mb-3">
                <View className="flex-1 mr-3">
                  <Text className="text-base font-semibold leading-tight text-zinc-900 dark:text-white">{circuit.name}</Text>
                  <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                    {[circuit.location, circuit.country].filter(Boolean).join(', ')}
                  </Text>
                </View>
                <StatusPill text={circuit.layoutName ?? i18n.t('common.track')} color="sky" />
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1 rounded-2xl bg-zinc-50 dark:bg-black/20 border border-zinc-100 dark:border-white/5 px-3 py-2.5">
                  <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">{i18n.t('circuits.length')}</Text>
                  <Text className="text-sm font-medium text-zinc-900 dark:text-white">{formatTrackLength(circuit.lengthMeters)}</Text>
                </View>
                <View className="flex-1 rounded-2xl bg-zinc-50 dark:bg-black/20 border border-zinc-100 dark:border-white/5 px-3 py-2.5">
                  <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">{i18n.t('circuits.corners')}</Text>
                  <Text className="text-sm font-medium text-zinc-900 dark:text-white">{circuit.corners ?? i18n.t('common.tbd')}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
