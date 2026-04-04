import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import i18n from '@/i18n';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';
import { useMenu } from '@/contexts/MenuContext';

const LEGAL_CONTACT_EMAIL = 'kev.tim@protonmail.com';

const ACCENT_BACK_COLOR: Record<AccentKey, string> = {
  violet: 'text-violet-400',
  sky: 'text-sky-400',
};

type LegalDocumentType = 'terms' | 'privacy';
type AccentKey = 'sky' | 'violet';

type LegalDocumentScreenProps = {
  accent: AccentKey;
  sectionIds: string[];
  type: LegalDocumentType;
};

export default function LegalDocumentScreen({
  accent,
  sectionIds,
  type,
}: LegalDocumentScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const gradientColors = useHeaderGradient(accent);
  const { locale } = useMenu();
  const baseKey = `legal.${type}`;

  return (
    <View className="flex-1 bg-zinc-50 dark:bg-zinc-900 overflow-hidden">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={gradientColors}
          locations={[0, 0.5, 1]}
          style={{ paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: 22 }}
        >
          <View className="flex-row items-center mb-5">
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text className={`text-sm font-medium ${ACCENT_BACK_COLOR[accent]}`}>
                {i18n.t('common.back', { locale })}
              </Text>
            </Pressable>
          </View>

          <Text className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-1">
            {i18n.t(`${baseKey}.title`, { locale })}
          </Text>
          <Text className="text-sm text-zinc-500 dark:text-zinc-400 leading-5 mb-3">
            {i18n.t(`${baseKey}.subtitle`, { locale })}
          </Text>
          <Text className="text-xs font-medium tracking-wide text-zinc-500 dark:text-zinc-400 uppercase">
            {i18n.t('legal.lastUpdated', { locale })} · {i18n.t(`${baseKey}.updatedAt`, { locale })}
          </Text>
        </LinearGradient>

        <View className="px-5 pt-6 gap-4">
          {sectionIds.map((sectionId) => (
            <View
              key={sectionId}
              className="rounded-2xl bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-4 py-4"
            >
              <Text className="text-base font-semibold tracking-tight text-zinc-900 dark:text-white mb-2">
                {i18n.t(`${baseKey}.sections.${sectionId}.title`, { locale })}
              </Text>
              <Text className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {i18n.t(`${baseKey}.sections.${sectionId}.body`, {
                  locale,
                  email: LEGAL_CONTACT_EMAIL,
                })}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
