import { Modal, Pressable, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import i18n from '@/i18n';
import { useColorScheme } from '@/hooks/useColorScheme';
import XPostCard from '@/components/share/XPostCard';

type XPostCardData = {
  sessionName: string;
  circuitName: string;
  location: string;
  car?: string | null;
  bestLap: string;
  totalLaps: string;
  topSpeed: string;
};

type XPostPreviewModalProps = {
  visible: boolean;
  isSharing: boolean;
  cardData: XPostCardData | null;
  onClose: () => void;
  onShare: () => void;
  onSaveToGallery: () => void;
};

const PREVIEW_SIZE = 306;
const CARD_SIZE = 1080;
const PREVIEW_SCALE = PREVIEW_SIZE / CARD_SIZE;

export default function XPostPreviewModal({
  visible,
  isSharing,
  cardData,
  onClose,
  onShare,
  onSaveToGallery,
}: XPostPreviewModalProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <Modal
      animationType="slide"
      visible={visible}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-zinc-50 dark:bg-zinc-950" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-white/10">
          <Pressable onPress={onClose} className="w-16 py-1">
            <Text className="text-[15px] text-zinc-500 dark:text-zinc-400">{i18n.t('common.cancel')}</Text>
          </Pressable>
          <Text className="text-[15px] font-semibold text-zinc-900 dark:text-white">{i18n.t('sessions.previewPost')}</Text>
          <Pressable onPress={onShare} disabled={isSharing} className="w-16 items-end py-1">
            <Text className={`text-[15px] font-semibold ${isSharing ? 'text-sky-400/50' : 'text-sky-500 dark:text-sky-400'}`}>
              {isSharing ? i18n.t('sessions.preparingShare') : i18n.t('sessions.share')}
            </Text>
          </Pressable>
        </View>

        <View className="flex-1 items-center justify-center">
          {cardData ? (
            <View
              className="overflow-hidden rounded-3xl border border-zinc-200 dark:border-white/10"
              style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
            >
              <View style={{ width: CARD_SIZE, height: CARD_SIZE, transform: [{ scale: PREVIEW_SCALE }], transformOrigin: 'top left' }}>
                <XPostCard
                  sessionName={cardData.sessionName}
                  circuitName={cardData.circuitName}
                  location={cardData.location}
                  car={cardData.car}
                  bestLap={cardData.bestLap}
                  totalLaps={cardData.totalLaps}
                  topSpeed={cardData.topSpeed}
                  bestLapLabel={i18n.t('sessions.storyBestLap')}
                  totalLapsLabel={i18n.t('sessions.storyTotalLaps')}
                  topSpeedLabel={i18n.t('sessions.storyTopSpeed')}
                />
              </View>
            </View>
          ) : null}

          <Pressable
            onPress={onSaveToGallery}
            disabled={isSharing}
            className="flex-row items-center justify-center gap-2 mt-5 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 py-3.5 px-6"
          >
            <Ionicons name="download-outline" size={18} color={isDark ? '#ffffff' : '#18181b'} />
            <Text className="text-sm font-medium text-zinc-900 dark:text-white">
              {i18n.t('sessions.saveToGallery')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
