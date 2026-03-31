import { Dimensions, FlatList, Modal, Pressable, View, Text, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import i18n from '@/i18n';
import { useColorScheme } from '@/hooks/useColorScheme';
import Checkerboard from '@/components/share/Checkerboard';
import SessionStoryCard from '@/components/share/SessionStoryCard';

const STORY_TEMPLATES = ['dark', 'transparent', 'photo'] as const;
const previewPageWidth = Dimensions.get('window').width;
const viewabilityConfig = { itemVisiblePercentThreshold: 50 };

type StoryCardData = {
  sessionName: string;
  circuitName: string;
  location: string;
  car?: string | null;
  bestLap: string;
  totalLaps: string;
  topSpeed: string;
};

type StoryPreviewModalProps = {
  visible: boolean;
  isSharing: boolean;
  storyTemplate: 'dark' | 'transparent' | 'photo';
  photoUri: string | null;
  storyCardData: StoryCardData | null;
  onClose: () => void;
  onShare: () => void;
  onSaveToGallery: () => void;
  onPickPhoto: () => void;
  onTemplateChange: (info: { viewableItems: ViewToken[] }) => void;
};

export default function StoryPreviewModal({
  visible,
  isSharing,
  storyTemplate,
  photoUri,
  storyCardData,
  onClose,
  onShare,
  onSaveToGallery,
  onPickPhoto,
  onTemplateChange,
}: StoryPreviewModalProps) {
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
          <Text className="text-[15px] font-semibold text-zinc-900 dark:text-white">{i18n.t('sessions.previewStory')}</Text>
          <Pressable onPress={onShare} disabled={isSharing} className="w-16 items-end py-1">
            <Text className={`text-[15px] font-semibold ${isSharing ? 'text-violet-400/50' : 'text-violet-500 dark:text-violet-400'}`}>
              {isSharing ? i18n.t('sessions.preparingShare') : i18n.t('sessions.share')}
            </Text>
          </Pressable>
        </View>

        <View className="flex-1 items-center justify-center">
          <FlatList
            data={STORY_TEMPLATES}
            keyExtractor={(item) => item}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onViewableItemsChanged={onTemplateChange}
            viewabilityConfig={viewabilityConfig}
            style={{ flexGrow: 0 }}
            renderItem={({ item: variant }) => (
              <View style={{ width: previewPageWidth, alignItems: 'center' }}>
                <Pressable
                  onPress={variant === 'photo' ? onPickPhoto : undefined}
                  disabled={variant !== 'photo'}
                  className="overflow-hidden rounded-3xl border border-zinc-200 dark:border-white/10"
                  style={{ width: 306, height: 544 }}
                >
                  {variant === 'transparent' ? (
                    <Checkerboard width={306} height={544} squareSize={16} />
                  ) : null}
                  {variant === 'photo' && !photoUri ? (
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.3)" />
                      <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 12, fontSize: 14 }}>
                        {i18n.t('sessions.tapToChoosePhoto')}
                      </Text>
                    </View>
                  ) : null}
                  {storyCardData && !(variant === 'photo' && !photoUri) ? (
                    <View style={{ width: 720, height: 1280, transform: [{ scale: 0.425 }], transformOrigin: 'top left' }}>
                      <SessionStoryCard
                        sessionName={storyCardData.sessionName}
                        circuitName={storyCardData.circuitName}
                        location={storyCardData.location}
                        car={storyCardData.car}
                        bestLap={storyCardData.bestLap}
                        totalLaps={storyCardData.totalLaps}
                        topSpeed={storyCardData.topSpeed}
                        bestLapLabel={i18n.t('sessions.storyBestLap')}
                        totalLapsLabel={i18n.t('sessions.storyTotalLaps')}
                        topSpeedLabel={i18n.t('sessions.storyTopSpeed')}
                        variant={variant}
                        backgroundImageUri={photoUri ?? undefined}
                      />
                    </View>
                  ) : null}
                </Pressable>
              </View>
            )}
          />

          {/* Dot indicators */}
          <View className="flex-row justify-center gap-2 mt-4">
            {STORY_TEMPLATES.map((variant) => (
              <View
                key={variant}
                className={`rounded-full ${storyTemplate === variant ? 'bg-violet-400' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                style={{ width: 8, height: 8 }}
              />
            ))}
          </View>

          {/* Save to gallery */}
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
