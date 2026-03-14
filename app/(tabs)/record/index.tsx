import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useThemeColor';
import i18n from '@/i18n';

export default function PreSessionScreen() {
  const colors = useTheme();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>
        {i18n.t('preSession.title')}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {i18n.t('sessionConfig.subtitle')}
      </Text>

      <Pressable
        style={[styles.button, { backgroundColor: colors.accent }]}
        onPress={() => router.push('/(tabs)/record/recording')}
      >
        <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>
          {i18n.t('session.start')}
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
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
    marginBottom: 32,
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
