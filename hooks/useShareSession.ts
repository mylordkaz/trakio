import { useRef, useState } from 'react';
import { Alert, type View, type ViewToken } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import i18n from '@/i18n';
import type { SessionDetail } from '@/db';
import { shareSessionToInstagramStory, shareImageWithText } from '@/services/share';
import { formatLapTime } from '@/utils/format';

type StoryTemplate = 'dark' | 'transparent' | 'photo' | 'line';

export function useShareSession(sessionDetail: SessionDetail | null) {
  const storyCardRef = useRef<View>(null);
  const xPostCardRef = useRef<View>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isShareSheetVisible, setIsShareSheetVisible] = useState(false);
  const [isStoryPreviewVisible, setIsStoryPreviewVisible] = useState(false);
  const [isXPostPreviewVisible, setIsXPostPreviewVisible] = useState(false);
  const [storyTemplate, setStoryTemplate] = useState<StoryTemplate>('dark');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const onTemplateChange = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.item) {
      setStoryTemplate(first.item as StoryTemplate);
    }
  }).current;

  function openShareSheet() {
    if (!sessionDetail || isSharing) {
      return;
    }

    setIsShareSheetVisible(true);
  }

  function closeStoryPreview() {
    setIsStoryPreviewVisible(false);
    setPhotoUri(null);
    setStoryTemplate('dark');
  }

  function openInstagramStoryPreview() {
    setIsShareSheetVisible(false);
    setIsStoryPreviewVisible(true);
  }

  function openXPostPreview() {
    setIsShareSheetVisible(false);
    setIsXPostPreviewVisible(true);
  }

  function closeXPostPreview() {
    setIsXPostPreviewVisible(false);
  }

  async function handlePickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function handleShareSession() {
    if (!sessionDetail || !storyCardRef.current || isSharing) {
      return;
    }

    if (storyTemplate === 'photo' && !photoUri) {
      Alert.alert(i18n.t('sessions.share'), i18n.t('sessions.choosePhotoFirst'));
      return;
    }

    try {
      setIsSharing(true);
      const isSticker = storyTemplate === 'transparent';
      const storyUri = await captureRef(storyCardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        ...(isSticker ? { backgroundColor: 'transparent' } : {}),
      });
      console.log('[share] captured story uri', storyUri);

      const result = await shareSessionToInstagramStory(storyUri, {
        mode: isSticker ? 'sticker' : 'background',
        backdropTopColor: '#0d2233',
        backdropBottomColor: '#0a1a28',
      });
      console.log('[share] instagram story result', result);

      if (result.ok) {
        closeStoryPreview();
        return;
      }

      const baseMessage =
        result.reason === 'missing_app_id'
          ? i18n.t('sessions.shareConfigurationMissing')
          : result.reason === 'instagram_unavailable'
            ? i18n.t('sessions.instagramUnavailable')
            : i18n.t('sessions.shareFailed');

      const message = result.message ? `${baseMessage}\n\n${result.message}` : baseMessage;

      Alert.alert(i18n.t('sessions.share'), message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log('[share] capture/share exception', message);
      Alert.alert(i18n.t('sessions.share'), `${i18n.t('sessions.shareFailed')}\n\n${message}`);
    } finally {
      setIsSharing(false);
    }
  }

  async function handleShareToX() {
    if (!sessionDetail || !xPostCardRef.current || isSharing) {
      return;
    }

    try {
      setIsSharing(true);
      const uri = await captureRef(xPostCardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      const track = sessionDetail.track.name;
      const bestLapMs = sessionDetail.session.bestLapMs;
      const car = sessionDetail.session.car;
      const tweetText = i18n.t('sessions.xTweetText', {
        track,
        time: bestLapMs !== null ? formatLapTime(bestLapMs) : '--:--.---',
        carLine: car ? ` | ${car}` : '',
      });

      const result = await shareImageWithText(uri, tweetText.trim());

      if (result.ok) {
        closeXPostPreview();
        return;
      }

      Alert.alert(i18n.t('sessions.share'), i18n.t('sessions.shareFailed'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert(i18n.t('sessions.share'), `${i18n.t('sessions.shareFailed')}\n\n${message}`);
    } finally {
      setIsSharing(false);
    }
  }

  async function handleSaveXPostToGallery() {
    if (!sessionDetail || !xPostCardRef.current || isSharing) {
      return;
    }

    try {
      setIsSharing(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(i18n.t('sessions.share'), i18n.t('sessions.galleryPermissionDenied'));
        return;
      }

      const uri = await captureRef(xPostCardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert(i18n.t('sessions.share'), i18n.t('sessions.savedToGallery'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert(i18n.t('sessions.share'), `${i18n.t('sessions.saveToGalleryFailed')}\n\n${message}`);
    } finally {
      setIsSharing(false);
    }
  }

  async function handleSaveToGallery() {
    if (!sessionDetail || !storyCardRef.current || isSharing) {
      return;
    }

    if (storyTemplate === 'photo' && !photoUri) {
      Alert.alert(i18n.t('sessions.share'), i18n.t('sessions.choosePhotoFirst'));
      return;
    }

    try {
      setIsSharing(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(i18n.t('sessions.share'), i18n.t('sessions.galleryPermissionDenied'));
        return;
      }

      const uri = await captureRef(storyCardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert(i18n.t('sessions.share'), i18n.t('sessions.savedToGallery'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert(i18n.t('sessions.share'), `${i18n.t('sessions.saveToGalleryFailed')}\n\n${message}`);
    } finally {
      setIsSharing(false);
    }
  }

  return {
    storyCardRef,
    xPostCardRef,
    isSharing,
    isShareSheetVisible,
    setIsShareSheetVisible,
    isStoryPreviewVisible,
    isXPostPreviewVisible,
    storyTemplate,
    photoUri,
    onTemplateChange,
    openShareSheet,
    closeStoryPreview,
    closeXPostPreview,
    openInstagramStoryPreview,
    openXPostPreview,
    handlePickPhoto,
    handleShareSession,
    handleShareToX,
    handleSaveToGallery,
    handleSaveXPostToGallery,
  };
}
