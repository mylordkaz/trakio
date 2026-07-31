import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import Card from '@/components/Card';
import i18n from '@/i18n';
import { formatLapTime } from '@/utils/format';
import { recordLeaderboardOffer } from '@/db';
import { getOrCreatePublisherId } from '@/services/publisher-id';
import { listLeaderboardEntries } from '@/services/leaderboard';
import { useLeaderboardShare } from '@/hooks/useLeaderboardShare';

type ShareToLeaderboardCardProps = {
  trackId: string;
  trackTitle: string;
  lapTimeMs: number;
  isNewBest: boolean;
};

export default function ShareToLeaderboardCard({
  trackId,
  trackTitle,
  lapTimeMs,
  isNewBest,
}: ShareToLeaderboardCardProps) {
  const db = useSQLiteContext();
  const { isSharing, share } = useLeaderboardShare(trackId);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [boardIsEmpty, setBoardIsEmpty] = useState(false);
  const hasRecordedOfferRef = useRef(false);

  useEffect(() => {
    // Once rendered, this best has been offered: the card must stay away
    // until a strictly better lap exists, whatever the user does with it.
    if (hasRecordedOfferRef.current) return;
    hasRecordedOfferRef.current = true;
    void recordLeaderboardOffer(db, trackId, lapTimeMs);
  }, [db, trackId, lapTimeMs]);

  useEffect(() => {
    let isMounted = true;

    async function checkBoard() {
      try {
        const publisherId = await getOrCreatePublisherId();
        const entries = await listLeaderboardEntries(trackId, publisherId);
        if (isMounted) {
          setBoardIsEmpty(entries.length === 0);
        }
      } catch {
        // Offline or board unavailable — keep the generic message.
      }
    }

    void checkBoard();

    return () => {
      isMounted = false;
    };
  }, [trackId]);

  if (isDismissed) {
    return null;
  }

  if (isShared) {
    return (
      <Card>
        <Text className="text-sm font-semibold text-emerald-500 text-center py-1">
          ✓ {i18n.t('leaderboard.timeIsLive')}
        </Text>
      </Card>
    );
  }

  const messageKey = boardIsEmpty
    ? 'leaderboard.offerBeFirstMessage'
    : isNewBest
      ? 'leaderboard.offerNewBestMessage'
      : 'leaderboard.offerBestMessage';

  async function handleShare() {
    const shared = await share(lapTimeMs);
    if (shared) {
      setIsShared(true);
    }
  }

  return (
    <Card>
      <Text className="text-sm font-medium text-zinc-900 dark:text-white mb-1">
        {i18n.t('leaderboard.shareToLeaderboard')}
      </Text>
      <Text className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
        {i18n.t(messageKey, {
          time: formatLapTime(lapTimeMs),
          track: trackTitle,
        })}
      </Text>
      <View className="flex-row gap-3">
        <Pressable
          onPress={() => setIsDismissed(true)}
          disabled={isSharing}
          className="flex-1 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 py-3 items-center"
        >
          <Text className="text-sm font-medium text-zinc-900 dark:text-white">
            {i18n.t('leaderboard.notNow')}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleShare}
          disabled={isSharing}
          className={`flex-1 rounded-2xl py-3 items-center border ${
            isNewBest
              ? 'bg-amber-500/10 border-amber-500/30'
              : 'bg-sky-500/10 border-sky-500/30'
          } ${isSharing ? 'opacity-60' : ''}`}
        >
          <Text
            className={`text-sm font-semibold ${
              isNewBest ? 'text-amber-500' : 'text-sky-500'
            }`}
          >
            {isSharing
              ? i18n.t('leaderboard.sharing')
              : i18n.t('leaderboard.shareMyBestTime')}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}
