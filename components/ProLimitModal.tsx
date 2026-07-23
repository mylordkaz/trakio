import { Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import i18n from '@/i18n';

type ProLimitModalProps = {
  visible: boolean;
  used: number;
  limit: number;
  onClose: () => void;
  onManageSessions: () => void;
  onViewPro: () => void;
};

export default function ProLimitModal({
  visible,
  used,
  limit,
  onClose,
  onManageSessions,
  onViewPro,
}: ProLimitModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 items-center justify-center bg-black/65 px-6"
        onPress={onClose}
      >
        <Pressable
          className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900"
          onPress={(event) => event.stopPropagation()}
        >
          <View className="mb-4 h-11 w-11 items-center justify-center rounded-full bg-amber-500/15">
            <Ionicons name="flag-outline" size={22} color="#f59e0b" />
          </View>
          <Text className="text-xl font-semibold text-zinc-900 dark:text-white">
            {i18n.t('pro.limitTitle')}
          </Text>
          <Text className="mt-2 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
            {i18n.t('pro.limitMessage', { used, limit })}
          </Text>

          <View className="mt-5 gap-2.5">
            <Pressable
              className="w-full items-center rounded-xl border border-zinc-200 py-3.5 dark:border-white/10"
              onPress={onManageSessions}
            >
              <Text className="text-sm font-medium text-zinc-900 dark:text-white">
                {i18n.t('pro.manageSessions')}
              </Text>
            </Pressable>
            <Pressable
              className="w-full items-center rounded-xl bg-amber-500 py-3.5"
              onPress={onViewPro}
            >
              <Text className="text-sm font-semibold text-black">
                {i18n.t('pro.viewPro')}
              </Text>
            </Pressable>
            <Pressable className="w-full items-center py-2" onPress={onClose}>
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                {i18n.t('common.cancel')}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
