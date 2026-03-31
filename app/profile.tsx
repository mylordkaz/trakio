import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  type TextInput as TextInputType,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import i18n from '@/i18n';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';
import { getOrCreateDefaultUserProfile, upsertUserProfile } from '@/db';
import type { UserRow } from '@/db';

type CountryEntry = { code: string; name: string; flag: string };

const COUNTRIES: CountryEntry[] = [
  { code: 'AU', name: 'Australia',     flag: '🇦🇺' },
  { code: 'AT', name: 'Austria',       flag: '🇦🇹' },
  { code: 'BE', name: 'Belgium',       flag: '🇧🇪' },
  { code: 'BR', name: 'Brazil',        flag: '🇧🇷' },
  { code: 'CA', name: 'Canada',        flag: '🇨🇦' },
  { code: 'CN', name: 'China',         flag: '🇨🇳' },
  { code: 'DK', name: 'Denmark',       flag: '🇩🇰' },
  { code: 'FI', name: 'Finland',       flag: '🇫🇮' },
  { code: 'FR', name: 'France',        flag: '🇫🇷' },
  { code: 'DE', name: 'Germany',       flag: '🇩🇪' },
  { code: 'IT', name: 'Italy',         flag: '🇮🇹' },
  { code: 'JP', name: 'Japan',         flag: '🇯🇵' },
  { code: 'MX', name: 'Mexico',        flag: '🇲🇽' },
  { code: 'NL', name: 'Netherlands',   flag: '🇳🇱' },
  { code: 'NZ', name: 'New Zealand',   flag: '🇳🇿' },
  { code: 'NO', name: 'Norway',        flag: '🇳🇴' },
  { code: 'PT', name: 'Portugal',      flag: '🇵🇹' },
  { code: 'KR', name: 'South Korea',   flag: '🇰🇷' },
  { code: 'ES', name: 'Spain',         flag: '🇪🇸' },
  { code: 'SE', name: 'Sweden',        flag: '🇸🇪' },
  { code: 'CH', name: 'Switzerland',   flag: '🇨🇭' },
  { code: 'GB', name: 'United Kingdom',flag: '🇬🇧' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
];

const NO_NATIONALITY = { code: '', flag: '🏁' } as const;

function countryByCode(code: string | null): CountryEntry | typeof NO_NATIONALITY {
  if (!code) return NO_NATIONALITY;
  const country = COUNTRIES.find((c) => c.code === code);
  return country ?? NO_NATIONALITY;
}

function isDirty(original: UserRow | null, username: string, car: string, countryCode: string | null, avatarUri: string | null) {
  if (!original) return true;
  return (
    original.username !== username ||
    (original.car ?? '') !== car ||
    original.countryCode !== countryCode ||
    original.avatarUri !== avatarUri
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const gradientColors = useHeaderGradient('sky');

  const [original, setOriginal] = useState<UserRow | null>(null);
  const [username, setUsername] = useState('');
  const [car, setCar] = useState('');
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const countrySearchRef = useRef<TextInputType>(null);

  const scrollCountrySectionIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    if (isCountryOpen) {
      scrollCountrySectionIntoView();
      const t = setTimeout(() => {
        scrollCountrySectionIntoView();
        countrySearchRef.current?.focus();
      }, 100);
      return () => clearTimeout(t);
    }
  }, [isCountryOpen, scrollCountrySectionIntoView]);

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      if (isCountryOpen) {
        scrollCountrySectionIntoView();
      }
    });

    return () => subscription.remove();
  }, [isCountryOpen, scrollCountrySectionIntoView]);

  useEffect(() => {
    getOrCreateDefaultUserProfile(db).then((user) => {
      setOriginal(user);
      setUsername(user.username);
      setCar(user.car ?? '');
      setCountryCode(user.countryCode);
      setAvatarUri(user.avatarUri);
    });
  }, [db]);

  const dirty = isDirty(original, username, car, countryCode, avatarUri);

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  }, []);

  const handlePickAvatar = useCallback(() => {
    if (!avatarUri) {
      pickImage();
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [i18n.t('common.cancel'), i18n.t('profile.changeAvatar'), i18n.t('profile.removeAvatar')],
        destructiveButtonIndex: 2,
        cancelButtonIndex: 0,
      },
      (index) => {
        if (index === 1) pickImage();
        if (index === 2) setAvatarUri(null);
      },
    );
  }, [avatarUri, pickImage]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    try {
      setIsSaving(true);
      await upsertUserProfile(db, {
        username: username.trim() || 'Driver',
        car: car.trim() || null,
        countryCode,
        avatarUri,
      });
      router.back();
    } catch {
      Alert.alert(i18n.t('profile.title'), 'Failed to save profile.');
    } finally {
      setIsSaving(false);
    }
  }, [db, router, username, car, countryCode, avatarUri, isSaving]);

  const selectedCountry = countryByCode(countryCode);
  const avatarInitial = (username.trim() || 'D')[0].toUpperCase();
  const selectedCountryName =
    selectedCountry.code === ''
      ? i18n.t('profile.defaultNationality')
      : i18n.t(`countries.${selectedCountry.code}`);

  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return [];
    return COUNTRIES.filter((c) => {
      const localizedName = i18n.t(`countries.${c.code}`).toLowerCase();
      return localizedName.includes(q) || c.code.toLowerCase().includes(q);
    });
  }, [countrySearch]);

  return (
    <View className="flex-1 bg-zinc-50 dark:bg-zinc-900 overflow-hidden">
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <LinearGradient
          colors={gradientColors}
          locations={[0, 0.5, 1]}
          style={{ paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: 20 }}
        >
          {/* Header row */}
          <View className="flex-row items-center justify-between mb-4">
            <Pressable onPress={() => router.back()} hitSlop={8} className="flex-row items-center gap-1.5">
              <Ionicons name="chevron-back" size={18} color={isDark ? '#a1a1aa' : '#71717a'} />
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('common.back')}</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!dirty || isSaving}
              hitSlop={8}
            >
              <Text className={`text-[15px] font-semibold ${dirty && !isSaving ? 'text-sky-500' : 'text-sky-500/30'}`}>
                {i18n.t('common.save')}
              </Text>
            </Pressable>
          </View>

          {/* Title */}
          <View className="mb-5">
            <Text className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">{i18n.t('profile.subtitle')}</Text>
            <Text className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">{i18n.t('profile.title')}</Text>
          </View>

          {/* Avatar */}
          <View className="items-center">
            <Pressable onPress={handlePickAvatar} className="items-center gap-2">
              <View className="h-20 w-20 rounded-full overflow-hidden bg-blue-500 items-center justify-center border-2 border-white/20">
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={{ width: 80, height: 80 }} />
                ) : (
                  <Text className="text-3xl font-bold text-white">{avatarInitial}</Text>
                )}
              </View>
              <Text className="text-sm text-sky-400">{i18n.t('profile.changeAvatar')}</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <View className="px-5 pt-6 gap-5">
          {/* Username + Car */}
          <View className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 overflow-hidden">
            <View className="flex-row items-center px-4 py-3.5 border-b border-zinc-100 dark:border-white/5">
              <Text className="w-36 text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('profile.username')}</Text>
              <TextInput
                style={{ flex: 1, fontSize: 15, color: isDark ? '#ffffff' : '#18181b', padding: 0 }}
                value={username}
                onChangeText={setUsername}
                placeholder="Driver"
                placeholderTextColor={isDark ? '#52525b' : '#a1a1aa'}
                returnKeyType="done"
              />
            </View>
            <View className="flex-row items-center px-4 py-3.5">
              <Text className="w-36 text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('profile.car')}</Text>
              <TextInput
                style={{ flex: 1, fontSize: 15, color: isDark ? '#ffffff' : '#18181b', padding: 0 }}
                value={car}
                onChangeText={setCar}
                placeholder="e.g. GR86 Track Build"
                placeholderTextColor={isDark ? '#52525b' : '#a1a1aa'}
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Nationality */}
          <View className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 overflow-hidden">
            <Pressable
              onPress={() => { setIsCountryOpen(!isCountryOpen); setCountrySearch(''); }}
              className="flex-row items-center px-4 py-3.5"
            >
              <Text className="w-36 text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('profile.nationality')}</Text>
              <View className="flex-1 flex-row items-center gap-2">
                <Text className="text-base">{selectedCountry.flag}</Text>
                <Text className="text-[15px] font-medium text-zinc-900 dark:text-white">{selectedCountryName}</Text>
              </View>
              <Ionicons name={isCountryOpen ? 'chevron-up' : 'chevron-down'} size={14} color={isDark ? '#52525b' : '#a1a1aa'} />
            </Pressable>

            {isCountryOpen && (
              <View className="border-t border-zinc-100 dark:border-white/5">
                {/* Search */}
                <View className="flex-row items-center gap-2 mx-3 my-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-white/5">
                  <Ionicons name="search" size={14} color={isDark ? '#71717a' : '#a1a1aa'} />
                  <TextInput
                    ref={countrySearchRef}
                    style={{ flex: 1, fontSize: 14, color: isDark ? '#ffffff' : '#18181b', padding: 0 }}
                    value={countrySearch}
                    onChangeText={setCountrySearch}
                    onFocus={scrollCountrySectionIntoView}
                    placeholder={i18n.t('profile.searchCountry')}
                    placeholderTextColor={isDark ? '#52525b' : '#a1a1aa'}
                    returnKeyType="search"
                  />
                  {countrySearch.length > 0 && (
                    <Pressable onPress={() => setCountrySearch('')} hitSlop={8}>
                      <Ionicons name="close-circle" size={14} color={isDark ? '#52525b' : '#a1a1aa'} />
                    </Pressable>
                  )}
                </View>

                {/* Default option */}
                <Pressable
                  onPress={() => { setCountryCode(null); setIsCountryOpen(false); setCountrySearch(''); }}
                  className={`flex-row items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-white/5 ${!countryCode ? 'bg-sky-500/10' : ''}`}
                >
                  <View className="flex-row items-center gap-3">
                    <Text className="text-base">{NO_NATIONALITY.flag}</Text>
                    <Text className={`text-[15px] ${!countryCode ? 'font-medium text-sky-500' : 'text-zinc-900 dark:text-white'}`}>
                      {i18n.t('profile.defaultNationality')}
                    </Text>
                  </View>
                  {!countryCode && <Ionicons name="checkmark" size={16} color="#0ea5e9" />}
                </Pressable>

                {/* Filtered results */}
                {filteredCountries.map((country) => {
                  const isSelected = country.code === countryCode;
                  return (
                    <Pressable
                      key={country.code}
                      onPress={() => { setCountryCode(country.code); setIsCountryOpen(false); setCountrySearch(''); }}
                      className={`flex-row items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-white/5 ${isSelected ? 'bg-sky-500/10' : ''}`}
                    >
                      <View className="flex-row items-center gap-3">
                        <Text className="text-base">{country.flag}</Text>
                        <Text className={`text-[15px] ${isSelected ? 'font-medium text-sky-500' : 'text-zinc-900 dark:text-white'}`}>
                          {i18n.t(`countries.${country.code}`)}
                        </Text>
                      </View>
                      {isSelected && <Ionicons name="checkmark" size={16} color="#0ea5e9" />}
                    </Pressable>
                  );
                })}

                {countrySearch.length > 0 && filteredCountries.length === 0 && (
                  <View className="px-4 py-3">
                    <Text className="text-sm text-zinc-400 dark:text-zinc-500">{i18n.t('profile.noCountriesFound')}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
