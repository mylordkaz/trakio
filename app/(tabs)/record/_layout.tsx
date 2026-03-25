import { Stack } from 'expo-router';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function RecordLayout() {
  const { colorScheme } = useColorScheme();
  const bg = colorScheme === 'dark' ? '#18181b' : '#fafafa';

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: bg },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="recording"
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="post-session"
        options={{ gestureEnabled: false, animation: 'none' }}
      />
    </Stack>
  );
}
