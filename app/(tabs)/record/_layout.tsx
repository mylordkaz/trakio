import { Stack } from 'expo-router';

export default function RecordLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="recording"
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="post-session"
        options={{ gestureEnabled: false }}
      />
    </Stack>
  );
}
