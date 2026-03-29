import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import Share, { Social } from 'react-native-share';

type ShareFailureReason = 'instagram_unavailable' | 'missing_app_id' | 'share_failed';

type ShareResult =
  | { ok: true }
  | { ok: false; reason: ShareFailureReason; message?: string };

type ShareMode = 'background' | 'sticker';

const INSTAGRAM_PACKAGE = 'com.instagram.android';
const INSTAGRAM_STORIES_URL = 'instagram-stories://share';

function getInstagramAppId() {
  const extra = Constants.expoConfig?.extra as { instagramAppId?: string } | undefined;
  const appId = extra?.instagramAppId?.trim();

  return appId ? appId : null;
}

async function isInstagramStoriesAvailable() {
  if (Platform.OS === 'android') {
    const result = await Share.isPackageInstalled(INSTAGRAM_PACKAGE);
    return result.isInstalled;
  }

  return Linking.canOpenURL(INSTAGRAM_STORIES_URL);
}

export async function shareSessionToInstagramStory(
  imageUri: string,
  mode: ShareMode = 'background',
): Promise<ShareResult> {
  const appId = getInstagramAppId();

  if (!appId) {
    return { ok: false, reason: 'missing_app_id', message: 'Missing instagramAppId in expo.extra.' };
  }

  const isAvailable = await isInstagramStoriesAvailable();
  if (!isAvailable) {
    return { ok: false, reason: 'instagram_unavailable', message: 'Instagram Stories app target is unavailable.' };
  }

  try {
    if (mode === 'sticker') {
      await Share.shareSingle({
        social: Social.InstagramStories,
        appId,
        stickerImage: imageUri,
      });
    } else {
      await Share.shareSingle({
        social: Social.InstagramStories,
        appId,
        backgroundImage: imageUri,
      });
    }

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: 'share_failed', message };
  }
}
