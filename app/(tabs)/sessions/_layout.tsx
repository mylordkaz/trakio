import { Stack } from 'expo-router';

// The anchor that navigation with withAnchor places beneath a session
// opened from another tab, so Back lands on the Sessions list.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function SessionsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="detail" />
    </Stack>
  );
}
