import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import i18n from '@/i18n';
import { getTrackById } from '@/db';
import type { TrackDetail } from '@/db';
import { getOrCreatePublisherId } from '@/services/publisher-id';
import { listLeaderboardEntries, flagEmoji, type LeaderboardEntry } from '@/services/leaderboard';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';
import { formatLapTime, formatDeltaMs } from '@/utils/format';

// ─── Podium ──────────────────────────────────────────────────────────────────

function PodiumCard({
  entry,
  height,
  isP1,
}: {
  entry: LeaderboardEntry;
  height: number;
  isP1: boolean;
}) {
  const rankColor = isP1 ? '#f59e0b' : entry.rank === 3 ? '#b45309' : '#e4e4e7';

  return (
    <View
      style={{
        flex: 1,
        height,
        borderRadius: 20,
        borderWidth: 1,
        backgroundColor: isP1 ? 'rgba(120,90,0,0.22)' : 'rgba(255,255,255,0.05)',
        borderColor: isP1 ? 'rgba(180,140,0,0.25)' : 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: 14,
        paddingHorizontal: 8,
      }}
    >
      {isP1 ? (
        <Text style={{ fontSize: 22, marginBottom: 6 }}>🏆</Text>
      ) : null}
      <Text style={{ fontSize: 20, marginBottom: 4 }}>{flagEmoji(entry.countryCode)}</Text>
      <Text
        style={{ fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 2 }}
        numberOfLines={1}
      >
        {entry.firstName}
      </Text>
      <Text style={{ fontSize: 13, fontWeight: '700', color: rankColor, marginBottom: 4 }}>
        P{entry.rank}
      </Text>
      <Text
        style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
      >
        {formatLapTime(entry.lapTimeMs)}
      </Text>
    </View>
  );
}

// ─── List row ─────────────────────────────────────────────────────────────────

function FullLeaderboardRow({
  entry,
  p1Ms,
}: {
  entry: LeaderboardEntry;
  p1Ms: number;
}) {
  const gap = entry.lapTimeMs - p1Ms;
  const gapStr = gap === 0 ? '—' : (formatDeltaMs(gap) ?? '—');
  const isMeBelowPodium = entry.isCurrentUser && entry.rank > 3;

  const rankColor =
    entry.rank === 1 ? '#f59e0b'
    : entry.rank === 3 ? '#b45309'
    : isMeBelowPodium ? '#38bdf8'
    : undefined;

  const accentOrWhite = isMeBelowPodium ? '#38bdf8' : '#ffffff';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 18,
        backgroundColor: entry.isCurrentUser
          ? 'rgba(56,189,248,0.1)'
          : 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: entry.isCurrentUser
          ? 'rgba(56,189,248,0.2)'
          : 'rgba(255,255,255,0.07)',
      }}
    >
      {/* Rank */}
      <Text
        style={{
          width: 28,
          fontSize: 15,
          fontWeight: '700',
          color: rankColor ?? 'rgba(255,255,255,0.35)',
          fontVariant: ['tabular-nums'],
        }}
      >
        {entry.rank}
      </Text>

      {/* Flag + name + car */}
      <View style={{ flex: 1, marginLeft: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 16 }}>{flagEmoji(entry.countryCode)}</Text>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '600',
              color: accentOrWhite,
            }}
            numberOfLines={1}
          >
            {entry.isCurrentUser
              ? `${entry.name} (${i18n.t('leaderboard.me')})`
              : entry.name}
          </Text>
        </View>
        {entry.car ? (
          <Text
            style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2, marginLeft: 22 }}
            numberOfLines={1}
          >
            {entry.car}
          </Text>
        ) : null}
      </View>

      {/* Time + gap */}
      <View style={{ alignItems: 'flex-end' }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: '700',
            color: accentOrWhite,
            fontVariant: ['tabular-nums'],
          }}
        >
          {formatLapTime(entry.lapTimeMs)}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.35)',
            marginTop: 2,
            fontVariant: ['tabular-nums'],
          }}
        >
          {gapStr}
        </Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();
  const { id } =
    useLocalSearchParams<{
      id: string;
    }>();

  const [track, setTrack] = useState<TrackDetail | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setTrack(null);
      return;
    }

    void getTrackById(db, id).then(setTrack);
  }, [db, id]);

  useEffect(() => {
    if (!id) {
      setEntries([]);
      setLoadError(null);
      return;
    }

    let isMounted = true;

    async function loadLeaderboard() {
      try {
        setIsLoading(true);
        setLoadError(null);
        const publisherId = await getOrCreatePublisherId();
        const nextEntries = await listLeaderboardEntries(id, publisherId);
        if (!isMounted) return;
        setEntries(nextEntries);
      } catch {
        if (!isMounted) return;
        setEntries([]);
        setLoadError(i18n.t('leaderboard.unableToLoad'));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadLeaderboard();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const gradientColors = useHeaderGradient('sky');
  const p1Ms = entries[0]?.lapTimeMs ?? 0;

  // Podium order: P2 (left), P1 (center), P3 (right)
  const p1 = entries[0];
  const p2 = entries[1];
  const p3 = entries[2];

  return (
    <View style={{ flex: 1, backgroundColor: '#18181b' }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header gradient */}
        <LinearGradient
          colors={gradientColors}
          locations={[0, 0.5, 1]}
          style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 24 }}
        >
          {/* Nav row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <Pressable onPress={() => router.back()}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#38bdf8' }}>
                {i18n.t('common.back')}
              </Text>
            </Pressable>
            <Text style={{ fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.5)' }}>
              {i18n.t('leaderboard.title')}
            </Text>
          </View>

          {/* Circuit + driver count */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                {track
                  ? [track.name, track.layoutName].filter(Boolean).join(' · ')
                  : i18n.t('common.track')}
              </Text>
              <Text style={{ fontSize: 28, fontWeight: '800', color: '#ffffff', letterSpacing: -0.5 }}>
                {i18n.t('leaderboard.allTimeBest')}
              </Text>
            </View>
            <View
              style={{
                backgroundColor: 'rgba(255,255,255,0.12)',
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingVertical: 8,
                marginTop: 4,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#ffffff' }}>
                {i18n.t('leaderboard.driversCount', { count: entries.length })}
              </Text>
            </View>
          </View>

          {/* Podium — adapts to 1, 2, or 3+ entries */}
          {p1 ? (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end', marginTop: 20 }}>
              {p2 ? <PodiumCard entry={p2} height={148} isP1={false} /> : <View style={{ flex: 1 }} />}
              <PodiumCard entry={p1} height={188} isP1={true} />
              {p3 ? <PodiumCard entry={p3} height={148} isP1={false} /> : <View style={{ flex: 1 }} />}
            </View>
          ) : null}
        </LinearGradient>

        {/* Full list */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 8 }}>
          {isLoading ? (
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
              {i18n.t('common.loading')}
            </Text>
          ) : loadError ? (
            <Text style={{ color: '#fca5a5', fontSize: 14 }}>
              {loadError}
            </Text>
          ) : entries.length === 0 ? (
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
              {i18n.t('leaderboard.noEntries')}
            </Text>
          ) : (
            entries.map((entry, index) => (
              <View key={entry.publisherId}>
                {index === 3 ? (
                  <Text
                    style={{
                      textAlign: 'center',
                      color: 'rgba(255,255,255,0.2)',
                      fontSize: 12,
                      letterSpacing: 4,
                      marginBottom: 8,
                      marginTop: -4,
                    }}
                  >
                    · · ·
                  </Text>
                ) : null}
                <FullLeaderboardRow entry={entry} p1Ms={p1Ms} />
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
