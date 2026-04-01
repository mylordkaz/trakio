import { Alert, View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Card from '@/components/Card';
import i18n from '@/i18n';
import { formatLapTime, formatDeltaMs } from '@/utils/format';
import { flagEmoji, rankLabel, type LeaderboardEntry } from '@/services/leaderboard';

type LeaderboardPreviewCardProps = {
  personalBestMs: number | null;
  isProfileComplete: boolean;
  entries: LeaderboardEntry[];
  isLoading?: boolean;
  loadError?: string | null;
  onShared: (lapTimeMs: number) => void;
  onSeeAll?: () => void;
};

function LeaderboardRow({ entry, p1Ms }: { entry: LeaderboardEntry; p1Ms: number }) {
  const gap = entry.lapTimeMs - p1Ms;
  const gapStr = gap === 0 ? '—' : (formatDeltaMs(gap) ?? '—');

  return (
    <View
      className={`flex-row items-center px-3 py-2.5 rounded-2xl ${entry.isCurrentUser ? 'bg-sky-500/10' : ''}`}
    >
      <Text
        className={`w-8 text-sm font-semibold ${entry.isCurrentUser ? 'text-sky-500' : 'text-zinc-500 dark:text-zinc-400'}`}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {entry.isCurrentUser ? `P${entry.rank}` : rankLabel(entry.rank)}
      </Text>
      <Text className="w-7 text-base">{flagEmoji(entry.countryCode)}</Text>
      <Text
        className={`flex-1 text-sm font-medium ${entry.isCurrentUser ? 'text-sky-500' : 'text-zinc-900 dark:text-white'}`}
        numberOfLines={1}
      >
        {entry.isCurrentUser
          ? `${entry.name} (${i18n.t('leaderboard.me')})`
          : entry.name}
      </Text>
      <Text
        className={`text-sm font-semibold mr-2 ${entry.isCurrentUser ? 'text-sky-500' : 'text-zinc-900 dark:text-white'}`}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {formatLapTime(entry.lapTimeMs)}
      </Text>
      <Text
        className="w-14 text-right text-xs text-zinc-400 dark:text-zinc-500"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {gapStr}
      </Text>
    </View>
  );
}

export default function LeaderboardPreviewCard({
  personalBestMs,
  isProfileComplete,
  entries,
  isLoading = false,
  loadError = null,
  onShared,
  onSeeAll,
}: LeaderboardPreviewCardProps) {
  const router = useRouter();
  const p1Ms = entries[0]?.lapTimeMs ?? 0;
  const top3 = entries.slice(0, 3);
  const userEntry = entries.find(e => e.isCurrentUser) ?? null;
  const userIsInTop3 = userEntry !== null && userEntry.rank <= 3;

  const sharedLapTimeMs = userEntry?.lapTimeMs ?? null;
  const hasShared = userEntry !== null;
  const hasNewPb = hasShared && personalBestMs !== null && personalBestMs < sharedLapTimeMs!;
  const isUpToDate = hasShared && !hasNewPb;
  const showButton = personalBestMs !== null;

  function handleShare() {
    if (!isProfileComplete) {
      Alert.alert(
        i18n.t('leaderboard.completeProfileTitle'),
        i18n.t('leaderboard.completeProfileMessage'),
        [
          { text: i18n.t('common.cancel'), style: 'cancel' },
          { text: i18n.t('leaderboard.goToProfile'), onPress: () => router.push('/profile') },
        ],
      );
      return;
    }
    if (personalBestMs !== null) {
      onShared(personalBestMs);
    }
  }

  return (
    <Card>
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <View>
          <Text className="text-sm font-medium text-zinc-900 dark:text-white">
            {i18n.t('leaderboard.title')}
          </Text>
          <Text className="text-xs text-zinc-500 dark:text-zinc-400">
            {i18n.t('leaderboard.driversCount', { count: entries.length })} · {i18n.t('leaderboard.allTime')}
          </Text>
        </View>
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text className="text-sm font-medium text-sky-500">
            {i18n.t('leaderboard.seeAll')} ›
          </Text>
        </Pressable>
      </View>

      {/* Top 3 */}
      {isLoading ? (
        <Text className="text-sm text-zinc-500 dark:text-zinc-400">
          {i18n.t('common.loading')}
        </Text>
      ) : loadError ? (
        <Text className="text-sm text-red-600 dark:text-red-300">
          {loadError}
        </Text>
      ) : entries.length === 0 ? (
        <Text className="text-sm text-zinc-500 dark:text-zinc-400">
          {i18n.t('leaderboard.noEntries')}
        </Text>
      ) : (
        <View className="gap-0.5">
          {top3.map(entry => (
            <LeaderboardRow key={entry.publisherId} entry={entry} p1Ms={p1Ms} />
          ))}
        </View>
      )}

      {/* Dot separator + user row (when user has a best and is outside top 3) */}
      {!isLoading && !loadError && entries.length > 0 && !userIsInTop3 ? (
        <>
          <Text className="text-center text-zinc-400 dark:text-zinc-600 my-2 tracking-widest text-xs">
            · · ·
          </Text>
          {userEntry ? (
            <LeaderboardRow entry={userEntry} p1Ms={p1Ms} />
          ) : null}
        </>
      ) : null}

      {/* Share button */}
      {showButton ? (
        <Pressable
          onPress={isUpToDate ? undefined : handleShare}
          disabled={isUpToDate}
          className={`mt-3 rounded-2xl py-3.5 items-center border ${
            isUpToDate
              ? 'bg-zinc-100 dark:bg-white/5 border-zinc-200 dark:border-white/10'
              : hasNewPb
              ? 'bg-amber-500/10 border-amber-500/30'
              : 'bg-sky-500/10 border-sky-500/30'
          }`}
        >
          <Text
            className={`text-sm font-semibold ${
              isUpToDate
                ? 'text-zinc-400 dark:text-zinc-500'
                : hasNewPb
                ? 'text-amber-500'
                : 'text-sky-500'
            }`}
          >
            {isUpToDate
              ? `${i18n.t('leaderboard.timeIsLive')} ✓`
              : hasNewPb
              ? i18n.t('leaderboard.updateMyTime')
              : i18n.t('leaderboard.shareMyBestTime')}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
