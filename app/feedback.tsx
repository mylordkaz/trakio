import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import i18n from '@/i18n';
import { useT } from '@/hooks/useT';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';
import { getOrCreateDefaultUserProfile } from '@/db';
import { submitFeedback } from '@/services/feedback';
import { getOrCreatePublisherIdSync } from '@/services/publisher-id';

export default function FeedbackScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const gradientColors = useHeaderGradient('sky');

  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    getOrCreateDefaultUserProfile(db).then((user) => {
      if (user.username) setName(user.username);
    });
  }, [db]);

  async function handleSubmit() {
    const trimmedName = name.trim();
    const trimmedMessage = message.trim();

    if (!trimmedName) {
      Alert.alert(t('feedback.missingName'), t('feedback.missingNameMessage'));
      return;
    }

    if (!trimmedMessage) {
      Alert.alert(t('feedback.missingMessage'), t('feedback.missingMessageMessage'));
      return;
    }

    try {
      setIsSending(true);
      await submitFeedback({
        name: trimmedName,
        message: trimmedMessage,
        publisherId: getOrCreatePublisherIdSync(),
        appVersion: Constants.expoConfig?.version ?? null,
        locale: i18n.locale,
      });
      Alert.alert(
        t('feedback.successTitle'),
        t('feedback.successMessage'),
        [{ text: t('common.done'), onPress: () => router.back() }],
      );
    } catch {
      Alert.alert(t('feedback.failedTitle'), t('feedback.failedMessage'));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ backgroundColor: isDark ? '#18181b' : '#fafafa' }}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={gradientColors}
          locations={[0, 0.5, 1]}
          style={{
            paddingTop: insets.top + 20,
            paddingHorizontal: 20,
            paddingBottom: 24,
          }}
        >
          <View className="flex-row items-center mb-6">
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text className="text-sm font-medium text-sky-400">{t('common.back')}</Text>
            </Pressable>
          </View>

          <Text className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-1">
            {t('feedback.title')}
          </Text>
          <Text className="text-sm text-zinc-500 dark:text-zinc-400 leading-5">
            {t('feedback.subtitle')}
          </Text>
        </LinearGradient>

        <View className="px-5 pt-6 gap-4">
          {/* Name */}
          <View className="rounded-2xl bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-4 py-3">
            <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5">
              {t('feedback.nameLabel')}
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('feedback.namePlaceholder')}
              placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
              style={{
                color: isDark ? '#e4e4e7' : '#18181b',
                fontSize: 15,
                padding: 0,
              }}
              returnKeyType="next"
              autoCorrect={false}
            />
          </View>

          {/* Message */}
          <View className="rounded-2xl bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-4 py-3">
            <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5">
              {t('feedback.messageLabel')}
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={t('feedback.messagePlaceholder')}
              placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
              style={{
                color: isDark ? '#e4e4e7' : '#18181b',
                fontSize: 15,
                padding: 0,
                minHeight: 120,
                textAlignVertical: 'top',
              }}
              multiline
              autoCorrect={false}
            />
          </View>

          {/* Submit */}
          <Pressable
            onPress={handleSubmit}
            disabled={isSending}
            className={`rounded-2xl py-4 items-center ${isSending ? 'bg-sky-500/60' : 'bg-sky-500'}`}
          >
            <Text className="text-sm font-semibold text-white">
              {isSending ? t('feedback.sending') : t('feedback.submit')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
