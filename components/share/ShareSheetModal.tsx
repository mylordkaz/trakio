import { Modal, Pressable, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import i18n from '@/i18n';
import { useColorScheme } from '@/hooks/useColorScheme';

type ShareSheetModalProps = {
  visible: boolean;
  onClose: () => void;
  onSelectInstagramStory: () => void;
  onSelectXPost: () => void;
};

export default function ShareSheetModal({ visible, onClose, onSelectInstagramStory, onSelectXPost }: ShareSheetModalProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1 bg-black/60 justify-end"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-t-3xl bg-zinc-100 dark:bg-zinc-900 px-5 pt-6 pb-10"
        >
          <View className="mb-5 items-center">
            <View className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          </View>
          <Text className="text-base font-semibold text-zinc-900 dark:text-white mb-4">
            {i18n.t('sessions.shareTo')}
          </Text>

          <Pressable
            onPress={onSelectInstagramStory}
            className="flex-row items-center gap-4 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3.5"
          >
            <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: '#E1306C15' }}>
              <Ionicons name="logo-instagram" size={22} color="#E1306C" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-zinc-900 dark:text-white">
                {i18n.t('sessions.instagramStory')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={isDark ? '#52525b' : '#a1a1aa'} />
          </Pressable>

          <Pressable
            onPress={onSelectXPost}
            className="mt-3 flex-row items-center gap-4 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3.5"
          >
            <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
              <Ionicons name="logo-x" size={22} color={isDark ? '#ffffff' : '#18181b'} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-zinc-900 dark:text-white">
                {i18n.t('sessions.xPost')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={isDark ? '#52525b' : '#a1a1aa'} />
          </Pressable>

          <Pressable
            onPress={onClose}
            className="mt-4 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-200/70 dark:bg-white/5 py-3.5 items-center"
          >
            <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              {i18n.t('common.cancel')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
