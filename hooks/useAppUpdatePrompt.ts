import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import * as Application from 'expo-application';
import { Storage } from 'expo-sqlite/kv-store';
import i18n from '@/i18n';
import { checkForAppUpdate } from '@/services/app-update';

const OPTIONAL_PROMPT_VERSION_KEY = 'app_update_optional_prompt_version';
const OPTIONAL_PROMPT_TIME_KEY = 'app_update_optional_prompt_time';
const OPTIONAL_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

function wasOptionalUpdatePromptedRecently(version: string, now: number): boolean {
  const promptedVersion = Storage.getItemSync(OPTIONAL_PROMPT_VERSION_KEY);
  const promptedAt = Number(Storage.getItemSync(OPTIONAL_PROMPT_TIME_KEY));

  return (
    promptedVersion === version &&
    Number.isFinite(promptedAt) &&
    now >= promptedAt &&
    now - promptedAt < OPTIONAL_REMINDER_INTERVAL_MS
  );
}

function rememberOptionalPrompt(version: string, now: number) {
  Storage.setItemSync(OPTIONAL_PROMPT_VERSION_KEY, version);
  Storage.setItemSync(OPTIONAL_PROMPT_TIME_KEY, String(now));
}

export function useAppUpdatePrompt(enabled: boolean) {
  const enabledRef = useRef(enabled);
  const isCheckingRef = useRef(false);
  const visibleVersionRef = useRef<string | null>(null);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const checkForUpdate = useCallback(async () => {
    const installedVersion = Application.nativeApplicationVersion;
    if (
      __DEV__ ||
      Platform.OS !== 'ios' ||
      !enabledRef.current ||
      !installedVersion ||
      isCheckingRef.current
    ) {
      return;
    }

    isCheckingRef.current = true;

    try {
      const releaseType = await Application.getIosApplicationReleaseTypeAsync();
      if (releaseType !== Application.ApplicationReleaseType.APP_STORE) {
        return;
      }

      const update = await checkForAppUpdate({
        installedVersion,
        locale: i18n.locale,
      });

      if (
        !update ||
        !enabledRef.current ||
        visibleVersionRef.current === update.latestVersion
      ) {
        return;
      }

      const now = Date.now();
      if (
        !update.mandatory &&
        wasOptionalUpdatePromptedRecently(update.latestVersion, now)
      ) {
        return;
      }

      visibleVersionRef.current = update.latestVersion;
      if (!update.mandatory) {
        rememberOptionalPrompt(update.latestVersion, now);
      }

      const title = i18n.t(
        update.mandatory ? 'appUpdate.requiredTitle' : 'appUpdate.availableTitle',
      );
      const baseMessage = i18n.t(
        update.mandatory ? 'appUpdate.requiredMessage' : 'appUpdate.availableMessage',
        { version: update.latestVersion },
      );
      const message = update.releaseNotes
        ? `${baseMessage}\n\n${update.releaseNotes}`
        : baseMessage;

      const openStore = () => {
        visibleVersionRef.current = null;
        void Linking.openURL(update.storeUrl).catch(() => undefined);
      };

      if (update.mandatory) {
        Alert.alert(
          title,
          message,
          [{ text: i18n.t('appUpdate.updateNow'), onPress: openStore }],
          { cancelable: false },
        );
        return;
      }

      Alert.alert(
        title,
        message,
        [
          {
            text: i18n.t('appUpdate.later'),
            style: 'cancel',
            onPress: () => {
              visibleVersionRef.current = null;
            },
          },
          { text: i18n.t('appUpdate.updateNow'), onPress: openStore },
        ],
      );
    } catch {
      // An update check must never prevent normal offline app use.
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (enabled && AppState.currentState === 'active') {
      void checkForUpdate();
    }
  }, [checkForUpdate, enabled]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkForUpdate();
      }
    });

    return () => subscription.remove();
  }, [checkForUpdate]);
}
