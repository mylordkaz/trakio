import { Stack } from 'expo-router';

export default function CircuitsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="detail" />
      <Stack.Screen name="leaderboard" />
    </Stack>
  );
}
