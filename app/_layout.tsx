import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DatabaseProvider } from '@/db';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const screenBackground = colorScheme === 'dark' ? '#18181b' : '#fafafa';

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
