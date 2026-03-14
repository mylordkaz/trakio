import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useThemeColor';
import i18n from '@/i18n';

export default function RecordingScreen() {
  const colors = useTheme();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.badge, { backgroundColor: colors.accentRed + '20' }]}>
        <View style={[styles.dot, { backgroundColor: colors.accentRed }]} />
        <Text style={[styles.badgeText, { color: colors.accentRed }]}>
          {i18n.t('session.recording')}
        </Text>
      </View>

      <Text style={[styles.timer, { color: colors.text }]}>0:00.00</Text>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {i18n.t('session.currentLap')}
      </Text>

      <Pressable
        style={[styles.button, { backgroundColor: colors.accentRed }]}
        onPress={() => router.replace('/(tabs)/record/post-session')}
      >
        <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>
          {i18n.t('session.end')}
        </Text>
      </Pressable>
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
    marginBottom: 24,
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
  timer: {
    fontSize: 56,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontSize: 14,
    marginTop: 4,
    marginBottom: 48,
  },
  button: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
