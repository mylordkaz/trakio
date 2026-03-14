import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useThemeColor';
import i18n from '@/i18n';

export default function PostSessionScreen() {
  const colors = useTheme();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.badge, { backgroundColor: colors.accent + '20' }]}>
        <View style={[styles.dot, { backgroundColor: colors.accent }]} />
        <Text style={[styles.badgeText, { color: colors.accent }]}>
          {i18n.t('session.saved')}
        </Text>
      </View>

      <Text style={[styles.title, { color: colors.text }]}>
        {i18n.t('postSession.title')}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {i18n.t('postSession.sessionOverview')}
      </Text>

      <View style={styles.actions}>
        <Pressable
          style={[styles.secondaryButton, { borderColor: colors.surfaceBorder }]}
          onPress={() => router.replace('/(tabs)/record')}
        >
          <Text style={[styles.buttonText, { color: colors.text }]}>
            {i18n.t('postSession.export')}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.primaryButton, { backgroundColor: colors.accent }]}
          onPress={() => router.replace('/(tabs)/record')}
        >
          <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>
            {i18n.t('session.newSession')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
    color: '#8E8E93',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 48,
  },
  secondaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  primaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
