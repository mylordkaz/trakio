import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import i18n from '@/i18n';
import { getOrCreateDefaultUserProfile, recordLeaderboardShare } from '@/db';
import { getOrCreatePublisherId } from '@/services/publisher-id';
import { shareLeaderboardTime } from '@/services/leaderboard';

export function useLeaderboardShare(trackId: string | undefined) {
  const db = useSQLiteContext();
  const router = useRouter();
  const [isSharing, setIsSharing] = useState(false);

  const share = useCallback(
    async (lapTimeMs: number): Promise<boolean> => {
      if (!trackId || isSharing) {
        return false;
      }

      const profile = await getOrCreateDefaultUserProfile(db);
      const isProfileComplete =
        profile.username.trim().length > 0 &&
        (profile.car?.trim().length ?? 0) > 0;

      if (!isProfileComplete) {
        Alert.alert(
          i18n.t('leaderboard.completeProfileTitle'),
          i18n.t('leaderboard.completeProfileMessage'),
          [
            { text: i18n.t('common.cancel'), style: 'cancel' },
            {
              text: i18n.t('leaderboard.goToProfile'),
              onPress: () => router.push('/profile'),
            },
          ],
        );
        return false;
      }

      try {
        setIsSharing(true);
        const publisherId = await getOrCreatePublisherId();
        await shareLeaderboardTime({
          trackId,
          publisherId,
          username: profile.username,
          countryCode: profile.countryCode,
          car: profile.car ?? null,
          lapTimeMs,
          submittedAt: new Date().toISOString(),
        });
        await recordLeaderboardShare(db, trackId, lapTimeMs);
        return true;
      } catch {
        Alert.alert(
          i18n.t('leaderboard.shareFailedTitle'),
          i18n.t('leaderboard.shareFailedMessage'),
        );
        return false;
      } finally {
        setIsSharing(false);
      }
    },
    [db, router, trackId, isSharing],
  );

  return { isSharing, share };
}
