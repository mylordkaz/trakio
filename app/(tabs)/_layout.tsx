import { Tabs } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import i18n from '@/i18n';
import { useColorScheme } from '@/hooks/useColorScheme';
import { MenuProvider, useMenu } from '@/contexts/MenuContext';
import MenuDrawer from '@/components/MenuDrawer';

function UnmountOnBlur({ children }: { children: React.ReactNode }) {
  const isFocused = useIsFocused();

  if (!isFocused) {
    return null;
  }

  return <>{children}</>;
}

function TabsNavigator() {
  const { colorScheme } = useColorScheme();
  const { locale } = useMenu();
  const isDark = colorScheme === 'dark';

  return (
    <>
      <Tabs
        key={locale}
        screenLayout={({ children }) => <UnmountOnBlur>{children}</UnmountOnBlur>}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: isDark ? '#18181b' : '#fafafa' },
          tabBarStyle: {
            backgroundColor: isDark ? '#18181b' : '#ffffff',
            borderTopColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
          },
          tabBarInactiveTintColor: isDark ? '#a1a1aa' : '#71717a',
        }}
      >
        <Tabs.Screen
          name="circuits"
          options={{
            tabBarLabel: i18n.t('circuits.header'),
            tabBarActiveTintColor: '#0ea5e9',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="map-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="record"
          options={{
            tabBarLabel: i18n.t('tabs.record'),
            tabBarActiveTintColor: '#10b981',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="radio-button-on" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="sessions"
          options={{
            tabBarLabel: i18n.t('sessions.header'),
            tabBarActiveTintColor: '#8b5cf6',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="timer-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
      <MenuDrawer />
    </>
  );
}

export default function TabsLayout() {
  return (
    <MenuProvider>
      <TabsNavigator />
    </MenuProvider>
  );
}
