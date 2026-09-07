import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import i18n from '@/i18n';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';
import { useMenu } from '@/contexts/MenuContext';

const OPENSTREETMAP_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

export default function DataLicencesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const gradientColors = useHeaderGradient('sky');
  const { locale } = useMenu();

  return (
    <View className="flex-1 overflow-hidden bg-zinc-50 dark:bg-zinc-900">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={gradientColors}
          locations={[0, 0.5, 1]}
          style={{
            paddingTop: insets.top + 20,
            paddingHorizontal: 20,
            paddingBottom: 22,
          }}
        >
          <View className="mb-5 flex-row items-center">
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text className="text-sm font-medium text-sky-400">
                {i18n.t('common.back', { locale })}
              </Text>
            </Pressable>
          </View>

          <Text className="mb-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            {i18n.t('dataLicences.title', { locale })}
          </Text>
          <Text className="text-sm leading-5 text-zinc-500 dark:text-zinc-400">
            {i18n.t('dataLicences.subtitle', { locale })}
          </Text>
        </LinearGradient>

        <View className="px-5 pt-6">
          <View className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-white/5">
            <Text className="mb-2 text-base font-semibold tracking-tight text-zinc-900 dark:text-white">
              {i18n.t('dataLicences.circuitGeometry', { locale })}
            </Text>
            <Text className="mb-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {i18n.t('dataLicences.circuitGeometryBody', { locale })}
            </Text>

            <Pressable
              accessibilityRole="link"
              accessibilityLabel={i18n.t('dataLicences.viewDetails', { locale })}
              onPress={() => {
                void Linking.openURL(OPENSTREETMAP_COPYRIGHT_URL).catch(() => undefined);
              }}
              className="flex-row items-center justify-between rounded-xl border border-zinc-200 bg-zinc-100 px-3.5 py-3 dark:border-white/10 dark:bg-white/5"
            >
              <View className="flex-1 pr-3">
                <Text className="text-sm font-semibold text-sky-600 dark:text-sky-400">
                  {i18n.t('dataLicences.attribution', { locale })}
                </Text>
                <Text className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {i18n.t('dataLicences.licence', { locale })}
                </Text>
              </View>
              <Ionicons
                name="open-outline"
                size={18}
                color="#38bdf8"
              />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
