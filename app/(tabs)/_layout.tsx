import { Tabs } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import i18n from '@/i18n';
import { useColorScheme } from '@/hooks/useColorScheme';

function UnmountOnBlur({ children }: { children: React.ReactNode }) {
  const isFocused = useIsFocused();

  if (!isFocused) {
    return null;
  }

  return <>{children}</>;
}

export default function TabsLayout() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <Tabs
      screenLayout={({ children }) => <UnmountOnBlur>{children}</UnmountOnBlur>}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDark ? '#18181b' : '#ffffff',
          borderTopColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
        },
        tabBarActiveTintColor: '#0ea5e9',
        tabBarInactiveTintColor: isDark ? '#a1a1aa' : '#71717a',
      }}
    >
      <Tabs.Screen
        name="circuits"
        options={{
          tabBarLabel: i18n.t('circuits.header'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          tabBarLabel: i18n.t('tabs.record'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="radio-button-on" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          tabBarLabel: i18n.t('sessions.header'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="timer-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
