import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import i18n from '@/i18n';
import { useColorScheme } from '@/hooks/useColorScheme';
import {
  CIRCUIT_NAME_MAX_LENGTH,
  submitCircuitRequest,
} from '@/services/circuit-requests';
import { getOrCreatePublisherIdSync } from '@/services/publisher-id';

type CircuitRequestModalProps = {
  visible: boolean;
  initialCircuitName?: string;
  onClose: () => void;
};

export default function CircuitRequestModal({
  visible,
  initialCircuitName = '',
  onClose,
}: CircuitRequestModalProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [circuitName, setCircuitName] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedCircuit, setSubmittedCircuit] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    setCircuitName(initialCircuitName.slice(0, CIRCUIT_NAME_MAX_LENGTH));
    setIsSending(false);
    setError(null);
    setSubmittedCircuit(null);
  }, [initialCircuitName, visible]);

  async function handleSubmit() {
    const trimmedName = circuitName.trim();
    if (!trimmedName || isSending) return;

    try {
      setIsSending(true);
      setError(null);
      await submitCircuitRequest({
        circuitName: trimmedName,
        publisherId: getOrCreatePublisherIdSync(),
        appVersion: Constants.expoConfig?.version ?? null,
        locale: i18n.locale,
      });
      setSubmittedCircuit(trimmedName);
    } catch {
      setError(i18n.t('circuits.requestFailed'));
    } finally {
      setIsSending(false);
    }
  }

  const canSubmit = circuitName.trim().length > 0 && !isSending;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 items-center justify-center bg-black/60 px-5"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={i18n.t('common.cancel')}
          className="absolute inset-0"
          onPress={onClose}
        />
        <View
          className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 p-5"
          style={{ marginTop: insets.top, marginBottom: insets.bottom }}
        >
          <View className="flex-row items-center justify-between mb-5">
            <View className="flex-row items-center gap-3 flex-1">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-sky-500/15">
                <Ionicons name="map-outline" size={20} color="#0ea5e9" />
              </View>
              <Text className="text-lg font-semibold text-zinc-900 dark:text-white">
                {i18n.t('circuits.requestTitle')}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={i18n.t('common.cancel')}
            >
              <Ionicons
                name="close"
                size={24}
                color={isDark ? '#a1a1aa' : '#71717a'}
              />
            </Pressable>
          </View>

          {submittedCircuit ? (
            <View className="items-center py-3">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
                <Ionicons name="checkmark" size={30} color="#10b981" />
              </View>
              <Text className="mt-4 text-lg font-semibold text-zinc-900 dark:text-white">
                {i18n.t('circuits.requestSuccessTitle')}
              </Text>
              <Text className="mt-2 text-center text-sm leading-5 text-zinc-500 dark:text-zinc-400">
                {i18n.t('circuits.requestSuccessMessage', { name: submittedCircuit })}
              </Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                className="mt-5 h-12 w-full items-center justify-center rounded-xl bg-sky-500"
              >
                <Text className="text-sm font-semibold text-white">
                  {i18n.t('common.done')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text className="text-base font-medium text-zinc-800 dark:text-zinc-100 mb-3">
                {i18n.t('circuits.requestQuestion')}
              </Text>
              <View className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-black/20 px-4 py-3">
                <TextInput
                  autoFocus
                  value={circuitName}
                  onChangeText={setCircuitName}
                  maxLength={CIRCUIT_NAME_MAX_LENGTH}
                  placeholder={i18n.t('circuits.requestPlaceholder')}
                  placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
                  returnKeyType="send"
                  onSubmitEditing={() => void handleSubmit()}
                  style={{
                    color: isDark ? '#f4f4f5' : '#18181b',
                    fontSize: 16,
                    padding: 0,
                  }}
                />
              </View>

              {error ? (
                <Text className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</Text>
              ) : null}

              <Pressable
                onPress={() => void handleSubmit()}
                disabled={!canSubmit}
                accessibilityRole="button"
                className={`mt-5 h-12 flex-row items-center justify-center gap-2 rounded-xl ${
                  canSubmit ? 'bg-sky-500' : 'bg-zinc-200 dark:bg-white/10'
                }`}
              >
                <Ionicons
                  name="paper-plane"
                  size={17}
                  color={canSubmit ? '#ffffff' : isDark ? '#71717a' : '#a1a1aa'}
                />
                <Text
                  className={`text-sm font-semibold ${
                    canSubmit ? 'text-white' : 'text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  {isSending
                    ? i18n.t('circuits.requestSending')
                    : i18n.t('circuits.requestSend')}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
