import { View, Text, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type XPostCardProps = {
  sessionName: string;
  circuitName: string;
  location: string;
  car?: string | null;
  bestLap: string;
  totalLaps: string;
  topSpeed: string;
  bestLapLabel: string;
  totalLapsLabel: string;
  topSpeedLabel: string;
};

export default function XPostCard({
  sessionName,
  circuitName,
  location,
  car,
  bestLap,
  totalLaps,
  topSpeed,
  bestLapLabel,
  totalLapsLabel,
  topSpeedLabel,
}: XPostCardProps) {
  return (
    <LinearGradient
      colors={['#0d2233', '#0b1f30', '#0a1a28']}
      locations={[0, 0.5, 1]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={{ width: 1080, height: 1080 }}
    >
      {/* Decorative track silhouette */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 60, left: 0, right: 0, bottom: 60, alignItems: 'center', justifyContent: 'center', opacity: 0.06 }}
      >
        <Image
          source={require('../../assets/lemans.png')}
          style={{ width: 780, height: 660, tintColor: 'white' }}
          resizeMode="contain"
        />
      </View>

      <View style={{ flex: 1, paddingHorizontal: 72, paddingTop: 72, paddingBottom: 56 }}>
        {/* Session header */}
        <View>
          <Text style={{ fontSize: 24, fontWeight: '600', letterSpacing: 4, color: 'rgba(20,180,200,0.9)' }}>
            TRACK DAY · {sessionName.toUpperCase()}
          </Text>
          <Text
            className="mt-3 text-white"
            style={{ fontSize: 56, lineHeight: 62, fontWeight: '700' }}
            numberOfLines={1}
          >
            {circuitName}
          </Text>
          <Text className="mt-2" style={{ fontSize: 26, color: 'rgba(255,255,255,0.4)' }}>
            {location}
          </Text>
          {car ? (
            <Text className="mt-3" style={{ fontSize: 32, fontWeight: '500', color: 'rgba(255,255,255,0.4)' }}>
              {car}
            </Text>
          ) : null}
        </View>

        {/* Best lap hero */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text
            className="uppercase"
            style={{ fontSize: 22, fontWeight: '500', letterSpacing: 4, color: 'rgba(255,255,255,0.35)' }}
          >
            {bestLapLabel}
          </Text>
          <Text
            className="mt-2"
            style={{
              fontSize: 108,
              lineHeight: 116,
              fontWeight: '600',
              fontVariant: ['tabular-nums'],
              color: '#ffffff',
              textShadowColor: 'rgba(20,160,180,0.4)',
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 28,
            }}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {bestLap}
          </Text>
          <LinearGradient
            colors={['#14b8c8', '#0ea5e9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: 100, height: 5, borderRadius: 3, marginTop: 18 }}
          />
        </View>

        {/* Stats row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 }}>
          <View className="items-center">
            <Text
              className="uppercase"
              style={{ fontSize: 22, fontWeight: '500', letterSpacing: 3, color: 'rgba(255,255,255,0.35)' }}
            >
              {totalLapsLabel}
            </Text>
            <Text
              className="mt-2 text-white"
              style={{ fontSize: 48, fontWeight: '600', fontVariant: ['tabular-nums'] }}
            >
              {totalLaps}
            </Text>
          </View>
          <View className="items-center">
            <Text
              className="uppercase"
              style={{ fontSize: 22, fontWeight: '500', letterSpacing: 3, color: 'rgba(255,255,255,0.35)' }}
            >
              {topSpeedLabel}
            </Text>
            <Text
              className="mt-2 text-white"
              style={{ fontSize: 48, fontWeight: '600', fontVariant: ['tabular-nums'] }}
            >
              {topSpeed}
            </Text>
          </View>
        </View>

        {/* Trakio watermark */}
        <Text
          className="text-center"
          style={{
            fontSize: 34,
            fontWeight: '700',
            fontStyle: 'italic',
            letterSpacing: 1,
            color: 'rgba(255,255,255,0.3)',
            textShadowColor: 'rgba(20,160,180,0.25)',
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 12,
          }}
        >
          Trakio
        </Text>
      </View>
    </LinearGradient>
  );
}
