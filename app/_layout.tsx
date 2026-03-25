import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { DatabaseProvider } from '@/db';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const screenBackground = colorScheme === 'dark' ? '#18181b' : '#fafafa';

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
      </Stack>
    </DatabaseProvider>
  );
}
