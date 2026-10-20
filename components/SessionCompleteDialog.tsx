import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { useT } from '@/hooks/useT';
import { useLeaderboardShare } from '@/hooks/useLeaderboardShare';
import { recordLeaderboardOffer } from '@/db';
import { getOrCreatePublisherId } from '@/services/publisher-id';
import { listLeaderboardEntries } from '@/services/leaderboard';
import { formatLapTime } from '@/utils/format';
import type { SessionOutcome } from '@/utils/session-complete';

type SessionCompleteDialogProps = {
  trackId: string;
  trackTitle: string;
  outcome: SessionOutcome;
  bestLapMs: number | null;
  isBestLapEstimated: boolean;
  improvementMs: number | null;
  offerShare: boolean;
  onShared: () => void;
  onClose: () => void;
};

const TITLE_KEYS: Record<SessionOutcome, string> = {
  noTimedLap: 'sessionComplete.titleSaved',
  firstAtTrack: 'sessionComplete.titleFirstAtTrack',
  newBest: 'sessionComplete.titleNewBest',
  saved: 'sessionComplete.titleSaved',
};

export default function SessionCompleteDialog({
  trackId,
  trackTitle,
  outcome,
  bestLapMs,
  isBestLapEstimated,
  improvementMs,
  offerShare,
  onShared,
  onClose,
}: SessionCompleteDialogProps) {
  const t = useT();
  const db = useSQLiteContext();
  const { isSharing, share } = useLeaderboardShare(trackId);
  const [isShared, setIsShared] = useState(false);
  const [boardIsEmpty, setBoardIsEmpty] = useState(false);
  const hasRecordedOfferRef = useRef(false);
  const isCelebration = outcome === 'firstAtTrack' || outcome === 'newBest';

  useEffect(() => {
    // Once shown, this best has been offered: the offer stays away until a
    // strictly better lap exists, whatever the user does with it.
    if (!offerShare || bestLapMs === null || hasRecordedOfferRef.current) return;
    hasRecordedOfferRef.current = true;
    void recordLeaderboardOffer(db, trackId, bestLapMs).catch(() => undefined);
  }, [db, trackId, bestLapMs, offerShare]);

  useEffect(() => {
    if (!offerShare) return;
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
  }, [offerShare, trackId]);

  async function handleShare() {
    if (bestLapMs === null) return;
    const shared = await share(bestLapMs);
    if (shared) {
      setIsShared(true);
      onShared();
    }
  }

  const shareMessageKey = boardIsEmpty
    ? 'leaderboard.offerBeFirstMessage'
    : outcome === 'newBest'
      ? 'leaderboard.offerNewBestMessage'
      : 'leaderboard.offerBestMessage';
  const showShareButton = offerShare && bestLapMs !== null && !isShared;

  return (
    <View className="absolute inset-0 items-center justify-center bg-black/60 px-6">
      <View className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <View className="items-center">
          <Ionicons
            name={isCelebration ? 'trophy' : 'checkmark-circle'}
            size={40}
            color={isCelebration ? '#f59e0b' : '#10b981'}
          />
          <Text className="mt-3 text-center text-xl font-semibold text-zinc-900 dark:text-white">
            {t(TITLE_KEYS[outcome], { track: trackTitle })}
          </Text>

          {bestLapMs !== null ? (
            <>
              <Text className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                {t('session.bestLap')}
              </Text>
              <Text
                className="text-zinc-900 dark:text-white"
                style={{ fontSize: 44, lineHeight: 52, fontWeight: '600', fontVariant: ['tabular-nums'] }}
              >
                {`${isBestLapEstimated ? '≈' : ''}${formatLapTime(bestLapMs)}`}
              </Text>
            </>
          ) : (
            <Text className="mt-3 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {t('sessionComplete.noTimedLap')}
            </Text>
          )}

          {outcome === 'newBest' && improvementMs !== null ? (
            <Text className="mt-1 text-sm font-medium text-emerald-500">
              {t('sessionComplete.improvement', { gap: (improvementMs / 1000).toFixed(3) })}
            </Text>
          ) : null}

          {showShareButton ? (
            <Text className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {t(shareMessageKey, { time: formatLapTime(bestLapMs), track: trackTitle })}
            </Text>
          ) : null}

          {isShared ? (
            <Text className="mt-4 text-sm font-semibold text-emerald-500">
              ✓ {t('leaderboard.timeIsLive')}
            </Text>
          ) : null}
        </View>

        <View className="mt-6 gap-3">
          {showShareButton ? (
            <Pressable
              onPress={handleShare}
              disabled={isSharing}
              className={`items-center rounded-2xl border border-amber-500/30 bg-amber-500/10 py-3.5 ${
                isSharing ? 'opacity-60' : ''
              }`}
            >
              <Text className="text-sm font-semibold text-amber-500">
                {isSharing ? t('leaderboard.sharing') : t('leaderboard.shareMyBestTime')}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onClose}
            disabled={isSharing}
            className="items-center rounded-2xl bg-emerald-500 py-3.5"
          >
            <Text className="text-sm font-semibold text-black">{t('common.ok')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
