import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import Share, { Social } from 'react-native-share';

type ShareFailureReason = 'instagram_unavailable' | 'missing_app_id' | 'share_failed';

type ShareResult =
  | { ok: true }
  | { ok: false; reason: ShareFailureReason; message?: string };

type ShareMode = 'background' | 'sticker';

type InstagramStoryShareOptions = {
  mode?: ShareMode;
  backdropTopColor?: string;
  backdropBottomColor?: string;
};

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
  options: InstagramStoryShareOptions = {},
): Promise<ShareResult> {
  const { mode = 'background', backdropTopColor, backdropBottomColor } = options;
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
        ...(backdropTopColor ? { backgroundTopColor: backdropTopColor } : {}),
        ...(backdropBottomColor ? { backgroundBottomColor: backdropBottomColor } : {}),
      });
    } else {
      await Share.shareSingle({
        social: Social.InstagramStories,
        appId,
        backgroundImage: imageUri,
        ...(backdropTopColor ? { backgroundTopColor: backdropTopColor } : {}),
        ...(backdropBottomColor ? { backgroundBottomColor: backdropBottomColor } : {}),
      });
    }

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: 'share_failed', message };
  }
}

export async function shareImageWithText(
  imageUri: string,
  text: string,
): Promise<ShareResult> {
  try {
    await Share.open({
      url: imageUri,
      message: text,
      type: 'image/png',
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('User did not share')) {
      return { ok: true };
    }
    return { ok: false, reason: 'share_failed', message };
  }
}
