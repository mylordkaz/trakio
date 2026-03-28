import { View, Text, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type SessionStoryCardProps = {
  sessionName: string;
  circuitName: string;
  location: string;
  bestLap: string;
  totalLaps: string;
  topSpeed: string;
  bestLapLabel: string;
  totalLapsLabel: string;
  topSpeedLabel: string;
  variant?: 'dark' | 'transparent';
};


export default function SessionStoryCard({
  sessionName,
  circuitName,
  location,
  bestLap,
  totalLaps,
  topSpeed,
  bestLapLabel,
  totalLapsLabel,
  topSpeedLabel,
  variant = 'dark',
}: SessionStoryCardProps) {
  const content = (
    <>
      {/* Decorative track silhouette */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 200, left: 0, right: 0, bottom: 140, alignItems: 'center', justifyContent: 'center', opacity: variant === 'dark' ? 0.08 : 0.15 }}
      >
        <Image
          source={require('../../assets/lemans.png')}
          style={{ width: 640, height: 540, tintColor: 'white' }}
          resizeMode="contain"
        />
      </View>

      <View className="flex-1 px-16 pb-24 pt-48">
        {/* Session header */}
        <View>
          <Text style={{ fontSize: 22, fontWeight: '600', letterSpacing: 4, color: 'rgba(20,180,200,0.9)' }}>
            TRACK DAY · {sessionName.toUpperCase()}
          </Text>
          <Text className="mt-3 text-white" style={{ fontSize: 52, lineHeight: 58, fontWeight: '800' }}>
            {circuitName}
          </Text>
          <Text className="mt-2" style={{ fontSize: 24, color: 'rgba(255,255,255,0.4)' }}>
            {location}
          </Text>
        </View>

        {/* Best lap hero */}
        <View className="mt-auto items-center">
          <Text
            className="uppercase"
            style={{ fontSize: 20, fontWeight: '600', letterSpacing: 4, color: 'rgba(255,255,255,0.35)' }}
          >
            {bestLapLabel}
          </Text>
          <Text
            className="mt-2"
            style={{
              fontSize: 108,
              lineHeight: 116,
              fontWeight: '800',
              fontVariant: ['tabular-nums'],
              color: '#ffffff',
              textShadowColor: 'rgba(20,160,180,0.4)',
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 24,
            }}
          >
            {bestLap}
          </Text>
          {/* Accent bar */}
          <LinearGradient
            colors={['#14b8c8', '#0ea5e9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: 80, height: 4, borderRadius: 2, marginTop: 16 }}
          />
        </View>

        {/* Stats */}
        <View className="mt-auto">
          <View className="flex-row justify-between mb-6">
            {/* Laps — left, centered vertically */}
            <View className="items-center">
              <Text
                className="uppercase"
                style={{ fontSize: 20, fontWeight: '500', letterSpacing: 3, color: 'rgba(255,255,255,0.35)' }}
              >
                {totalLapsLabel}
              </Text>
              <Text
                className="mt-3 text-white"
                style={{ fontSize: 40, fontWeight: '700', fontVariant: ['tabular-nums'] }}
              >
                {totalLaps}
              </Text>
            </View>
            {/* Speed — right, centered vertically */}
            <View className="items-center">
              <Text
                className="uppercase"
                style={{ fontSize: 20, fontWeight: '500', letterSpacing: 3, color: 'rgba(255,255,255,0.35)' }}
              >
                {topSpeedLabel}
              </Text>
              <Text
                className="mt-3 text-white"
                style={{ fontSize: 40, fontWeight: '700', fontVariant: ['tabular-nums'] }}
              >
                {topSpeed}
              </Text>
            </View>
          </View>

          {/* Trakio watermark */}
          <Text
            className="mt-8 text-center"
            style={{ fontSize: 32, fontWeight: '800', fontStyle: 'italic', letterSpacing: 1, color: 'rgba(255,255,255,0.35)', textShadowColor: 'rgba(20,160,180,0.3)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 16 }}
          >
            Trakio
          </Text>
        </View>
      </View>
    </>
  );

  if (variant === 'transparent') {
    return (
      <View style={{ width: 720, height: 1280, backgroundColor: 'transparent' }}>
        {content}
      </View>
    );
  }

  return (
    <LinearGradient
      colors={['#0d2233', '#0b1f30', '#0a1a28']}
      locations={[0, 0.5, 1]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={{ width: 720, height: 1280 }}
    >
      {content}
    </LinearGradient>
  );
}
