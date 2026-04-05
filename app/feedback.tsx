import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import i18n from '@/i18n';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';
import { getOrCreateDefaultUserProfile } from '@/db';

const FEEDBACK_EMAIL = 'kev.tim@protonmail.com';

export default function FeedbackScreen() {
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
      Alert.alert(i18n.t('feedback.missingName'), i18n.t('feedback.missingNameMessage'));
      return;
    }

    if (!trimmedMessage) {
      Alert.alert(i18n.t('feedback.missingMessage'), i18n.t('feedback.missingMessageMessage'));
      return;
    }

    setIsSending(true);

    const subject = encodeURIComponent(`[trakio] Feedback from ${trimmedName}`);
    const body = encodeURIComponent(`From: ${trimmedName}\n\n${trimmedMessage}`);
    const url = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert(i18n.t('feedback.noMailApp'), i18n.t('feedback.noMailAppMessage'));
        return;
      }
      await Linking.openURL(url);
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
              <Text className="text-sm font-medium text-sky-400">{i18n.t('common.back')}</Text>
            </Pressable>
          </View>

          <Text className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-1">
            {i18n.t('feedback.title')}
          </Text>
          <Text className="text-sm text-zinc-500 dark:text-zinc-400 leading-5">
            {i18n.t('feedback.subtitle')}
          </Text>
        </LinearGradient>

        <View className="px-5 pt-6 gap-4">
          {/* Name */}
          <View className="rounded-2xl bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-4 py-3">
            <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5">
              {i18n.t('feedback.nameLabel')}
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={i18n.t('feedback.namePlaceholder')}
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
              {i18n.t('feedback.messageLabel')}
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={i18n.t('feedback.messagePlaceholder')}
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
              {isSending ? i18n.t('feedback.sending') : i18n.t('feedback.submit')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
