import { useCallback, useEffect, useState } from 'react';
import { Dimensions, Image, Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import i18n from '@/i18n';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useMenu } from '@/contexts/MenuContext';
import { getUserProfile } from '@/db';
import type { UserRow } from '@/db';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.85;

type AppearanceMode = 'light' | 'dark' | 'system';

const APPEARANCE_OPTIONS: { mode: AppearanceMode; icon: 'sunny' | 'moon' | 'settings-outline' }[] = [
  { mode: 'light', icon: 'sunny' },
  { mode: 'dark', icon: 'moon' },
  { mode: 'system', icon: 'settings-outline' },
];

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '\u{1F1EC}\u{1F1E7}' },
  { code: 'ja', label: '\u65E5\u672C\u8A9E', flag: '\u{1F1EF}\u{1F1F5}' },
] as const;

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="text-xs font-semibold tracking-wider text-zinc-500 dark:text-zinc-500 mb-2 ml-1">
      {title.toUpperCase()}
    </Text>
  );
}

const FLAG_MAP: Record<string, string> = {
  AU: '🇦🇺', AT: '🇦🇹', BE: '🇧🇪', BR: '🇧🇷', CA: '🇨🇦', CN: '🇨🇳',
  DK: '🇩🇰', FI: '🇫🇮', FR: '🇫🇷', DE: '🇩🇪', IT: '🇮🇹', JP: '🇯🇵',
  MX: '🇲🇽', NL: '🇳🇱', NZ: '🇳🇿', NO: '🇳🇴', PT: '🇵🇹', KR: '🇰🇷',
  ES: '🇪🇸', SE: '🇸🇪', CH: '🇨🇭', GB: '🇬🇧', US: '🇺🇸',
};

export default function MenuDrawer() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { isMenuOpen, closeMenu, locale, setLocale, appearanceMode, setAppearanceMode } = useMenu();
  const router = useRouter();
  const db = useSQLiteContext();
  const [user, setUser] = useState<UserRow | null>(null);
  const progress = useSharedValue(0);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  useEffect(() => {
    progress.value = withTiming(isMenuOpen ? 1 : 0, {
      duration: 280,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [isMenuOpen, progress]);

  // Reload profile each time the drawer opens so it reflects any edits
  useEffect(() => {
    if (isMenuOpen) {
      getUserProfile(db).then((profile) => {
        if (profile) setUser(profile);
      });
    }
  }, [isMenuOpen, db]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
  }));

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-DRAWER_WIDTH, 0]) }],
  }));

  const currentAppearance = appearanceMode;

  // Wrap i18n.t so React compiler treats translations as dependent on locale
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useCallback((key: string, opts?: Record<string, unknown>) => i18n.t(key, opts), [locale]);

  const currentLang = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];
  const [isLangOpen, setIsLangOpen] = useState(false);

  return (
    <>
      {/* Backdrop */}
      <Animated.View
        pointerEvents={isMenuOpen ? 'auto' : 'none'}
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 100,
          },
          backdropStyle,
        ]}
      >
        <Pressable style={{ flex: 1 }} onPress={closeMenu} />
      </Animated.View>

      {/* Drawer */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: DRAWER_WIDTH,
            zIndex: 101,
          },
          drawerStyle,
        ]}
        className="bg-zinc-100 dark:bg-zinc-950"
      >
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: 20,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Close button */}
          <View className="items-end mb-4">
            <Pressable onPress={closeMenu} hitSlop={12}>
              <Ionicons name="close" size={24} color={isDark ? '#a1a1aa' : '#71717a'} />
            </Pressable>
          </View>

          {/* User Profile */}
          <Pressable
            onPress={() => { closeMenu(); router.push('/profile'); }}
            className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-4 mb-6"
          >
            <View className="flex-row items-center gap-4">
              <View className="h-14 w-14 rounded-full bg-blue-500 overflow-hidden items-center justify-center">
                {user?.avatarUri ? (
                  <Image source={{ uri: user.avatarUri }} style={{ width: 56, height: 56 }} />
                ) : (
                  <Text className="text-xl font-bold text-white">
                    {(user?.username ?? 'D')[0].toUpperCase()}
                  </Text>
                )}
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-base font-semibold text-zinc-900 dark:text-white" numberOfLines={1}>
                    {user?.username ?? '—'}
                  </Text>
                  <Text className="text-base">
                    {user?.countryCode ? (FLAG_MAP[user.countryCode] ?? '🏁') : '🏁'}
                  </Text>
                </View>
                {user?.car ? (
                  <Text className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5" numberOfLines={1}>
                    {user.car}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={isDark ? '#52525b' : '#a1a1aa'} />
            </View>
          </Pressable>

          {/* External GPS */}
          <SectionHeader title={t('menu.externalGps')} />
          <View className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-4 mb-6 overflow-hidden">
            <View className="flex-row items-center justify-between" style={{ opacity: 0.4 }}>
              <View className="flex-1 mr-3">
                <Text className="text-[15px] font-medium text-zinc-900 dark:text-white">
                  {t('menu.externalGpsDevice')}
                </Text>
                <Text className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {t('menu.noDevicePaired')}
                </Text>
              </View>
              <Switch
                value={false}
                disabled
                trackColor={{ false: isDark ? '#3f3f46' : '#d4d4d8', true: '#22c55e' }}
                thumbColor="#ffffff"
              />
            </View>
            <Pressable disabled style={{ opacity: 0.4 }} className="mt-3 rounded-xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 py-3 items-center">
              <Text className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                {t('menu.scanForDevices')}
              </Text>
            </Pressable>
            {/* "Soon" watermark — rendered last so it's on top */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 1 }} pointerEvents="none">
              <Text style={{ fontSize: 48, fontWeight: '800', color: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)', textTransform: 'uppercase', letterSpacing: 6 }}>
                SOON
              </Text>
            </View>
          </View>

          {/* Preferences */}
          <SectionHeader title={t('menu.preferences')} />
          <View className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 mb-6 overflow-hidden">
            {/* Appearance */}
            <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-100 dark:border-white/5">
              <Text className="text-[15px] font-medium text-zinc-900 dark:text-white">
                {t('menu.appearance')}
              </Text>
              <View className="flex-row rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 p-1">
                {APPEARANCE_OPTIONS.map(({ mode, icon }) => {
                  const isActive = mode === currentAppearance;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => setAppearanceMode(mode)}
                      className={`px-3 py-1.5 rounded-lg ${isActive ? 'bg-white dark:bg-white/20' : ''}`}
                    >
                      <Ionicons
                        name={icon}
                        size={16}
                        color={
                          isActive
                            ? isDark ? '#ffffff' : '#18181b'
                            : isDark ? '#71717a' : '#a1a1aa'
                        }
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Language */}
            <View className="px-4 py-3.5">
              <View className="flex-row items-center justify-between">
                <Text className="text-[15px] font-medium text-zinc-900 dark:text-white">
                  {t('menu.language')}
                </Text>
                <Pressable
                  onPress={() => setIsLangOpen(!isLangOpen)}
                  className="flex-row items-center gap-2 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 px-3.5 py-2"
                >
                  <Text className="text-sm">{currentLang.flag}</Text>
                  <Text className="text-sm font-medium text-zinc-900 dark:text-white">
                    {currentLang.label}
                  </Text>
                  <Ionicons
                    name={isLangOpen ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={isDark ? '#71717a' : '#a1a1aa'}
                  />
                </Pressable>
              </View>
              {isLangOpen && (
                <View className="mt-2 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 overflow-hidden">
                  {LANGUAGES.map((lang) => {
                    const isSelected = lang.code === locale;
                    return (
                      <Pressable
                        key={lang.code}
                        onPress={() => {
                          setLocale(lang.code);
                          setIsLangOpen(false);
                        }}
                        className={`flex-row items-center justify-between px-3.5 py-3 ${isSelected ? 'bg-zinc-200/70 dark:bg-white/10' : ''}`}
                      >
                        <View className="flex-row items-center gap-2.5">
                          <Text className="text-sm">{lang.flag}</Text>
                          <Text className="text-sm font-medium text-zinc-900 dark:text-white">
                            {lang.label}
                          </Text>
                        </View>
                        {isSelected && (
                          <Ionicons name="checkmark" size={16} color={isDark ? '#a78bfa' : '#7c3aed'} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </View>

          {/* About */}
          <SectionHeader title={t('menu.about')} />
          <View className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 overflow-hidden">
            {/* Version */}
            <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-100 dark:border-white/5">
              <Text className="text-[15px] font-medium text-zinc-900 dark:text-white">
                {t('menu.version')}
              </Text>
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                {appVersion} (MVP)
              </Text>
            </View>

            {/* Send Feedback */}
            <Pressable
              onPress={() => Linking.openURL('mailto:feedback@trakio.app')}
              className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-100 dark:border-white/5"
            >
              <Text className="text-[15px] font-medium text-zinc-900 dark:text-white">
                {t('menu.sendFeedback')}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={isDark ? '#52525b' : '#a1a1aa'} />
            </Pressable>

            {/* Terms of Use */}
            <Pressable
              onPress={() => Linking.openURL('https://trakio.app/terms')}
              className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-100 dark:border-white/5"
            >
              <Text className="text-[15px] font-medium text-zinc-900 dark:text-white">
                {t('menu.termsOfUse')}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={isDark ? '#52525b' : '#a1a1aa'} />
            </Pressable>

            {/* Privacy Policy */}
            <Pressable
              onPress={() => Linking.openURL('https://trakio.app/privacy')}
              className="flex-row items-center justify-between px-4 py-3.5"
            >
              <Text className="text-[15px] font-medium text-zinc-900 dark:text-white">
                {t('menu.privacyPolicy')}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={isDark ? '#52525b' : '#a1a1aa'} />
            </Pressable>
          </View>
        </ScrollView>
      </Animated.View>
    </>
  );
}
