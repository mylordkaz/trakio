import '../global.css';
import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { Storage } from 'expo-sqlite/kv-store';
import { DatabaseProvider } from '@/db';
import { useColorScheme } from '@/hooks/useColorScheme';
import i18n from '@/i18n';

// Apply persisted preferences synchronously before first render
const storedAppearance = Storage.getItemSync('appearance_mode');
const initialAppearance: 'light' | 'dark' | 'system' =
  storedAppearance === 'light' || storedAppearance === 'dark' || storedAppearance === 'system'
    ? storedAppearance
    : 'dark';

const storedLocale = Storage.getItemSync('locale');
if (storedLocale) {
  i18n.locale = storedLocale;
}

export default function RootLayout() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const screenBackground = colorScheme === 'dark' ? '#18181b' : '#fafafa';
  const hasAppliedInitialAppearance = useRef(false);

  useEffect(() => {
    if (hasAppliedInitialAppearance.current) {
      return;
    }

    hasAppliedInitialAppearance.current = true;
    setColorScheme(initialAppearance);
  }, [setColorScheme]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(screenBackground);
  }, [screenBackground]);

  return (
    <DatabaseProvider>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: screenBackground },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="index" />
        <Stack.Screen name="profile" />
      </Stack>
    </DatabaseProvider>
  );
}
