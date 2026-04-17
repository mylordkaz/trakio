import { useCallback } from 'react';
import { Text, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import i18n from '@/i18n';

const LANDING_DURATION_MS = 2500;

export default function LandingScreen() {
  const router = useRouter();
  const logoOpacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);
  const contentScale = useSharedValue(0.95);

  const onReady = useCallback(() => {
    SplashScreen.hideAsync();

    const ease = Easing.out(Easing.ease);
    logoOpacity.value = withDelay(100, withTiming(1, { duration: 600, easing: ease }));
    contentScale.value = withDelay(100, withTiming(1, { duration: 800, easing: ease }));
    textOpacity.value = withDelay(400, withTiming(1, { duration: 600, easing: ease }));

    const timer = setTimeout(() => {
      router.replace('/(tabs)/record');
    }, LANDING_DURATION_MS);

    return () => clearTimeout(timer);
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: contentScale.value }],
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  return (
    <LinearGradient
      colors={['#0d2233', '#0b1f30', '#0a1a28']}
      locations={[0, 0.5, 1]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      onLayout={onReady}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      <StatusBar style="light" />
      <Animated.View style={[{ alignItems: 'center' }, containerStyle]}>
        <Animated.View style={logoStyle}>
          <Image
            source={require('../assets/images/icon.png')}
            style={{ width: 120, height: 120, borderRadius: 28 }}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View style={[{ alignItems: 'center', marginTop: 24 }, textStyle]}>
          <Text
            style={{
              fontSize: 42,
              fontWeight: '700',
              fontStyle: 'italic',
              letterSpacing: 1,
              color: '#ffffff',
              textShadowColor: 'rgba(20,160,180,0.4)',
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 16,
            }}
          >
            {i18n.t('home.title')}
          </Text>

          <Text
            style={{
              marginTop: 8,
              fontSize: 13,
              fontWeight: '500',
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            {i18n.t('home.subtitle')}
          </Text>

          <LinearGradient
            colors={['#14b8c8', '#0ea5e9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: 60, height: 3, borderRadius: 1.5, marginTop: 20 }}
          />
        </Animated.View>
      </Animated.View>
    </LinearGradient>
  );
}
