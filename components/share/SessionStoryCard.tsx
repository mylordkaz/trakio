import { View, Text, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { gpsPointsToSvgPath, type GeoPoint } from '@/utils/racingLine';

type SessionStoryCardProps = {
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
  variant?: 'dark' | 'transparent' | 'photo' | 'line';
  backgroundImageUri?: string;
  racingLinePoints?: GeoPoint[];
  gpsUnavailableLabel?: string;
};

const LINE_SVG_WIDTH = 600;
const LINE_SVG_HEIGHT = 700;


export default function SessionStoryCard({
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
  variant = 'dark',
  backgroundImageUri,
  racingLinePoints,
  gpsUnavailableLabel,
}: SessionStoryCardProps) {
  if (variant === 'line') {
    const pathData = racingLinePoints
      ? gpsPointsToSvgPath(racingLinePoints, LINE_SVG_WIDTH, LINE_SVG_HEIGHT, 20)
      : null;

    return (
      <LinearGradient
        colors={['#0d2233', '#0b1f30', '#0a1a28']}
        locations={[0, 0.5, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{ width: 720, height: 1280 }}
      >
        {/* Top: racing line */}
        <View
          style={{
            width: 720,
            height: 780,
            paddingTop: 100,
            paddingHorizontal: 60,
            paddingBottom: 40,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {pathData ? (
            <Svg
              width={LINE_SVG_WIDTH}
              height={LINE_SVG_HEIGHT}
              viewBox={`0 0 ${LINE_SVG_WIDTH} ${LINE_SVG_HEIGHT}`}
            >
              <Path
                d={pathData}
                stroke="rgba(56,189,248,0.22)"
                strokeWidth={24}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <Path
                d={pathData}
                stroke="#38bdf8"
                strokeWidth={8}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Ionicons name="navigate-outline" size={72} color="rgba(255,255,255,0.22)" />
              <Text
                style={{
                  fontSize: 26,
                  color: 'rgba(255,255,255,0.4)',
                  fontWeight: '500',
                  marginTop: 20,
                  letterSpacing: 0.5,
                }}
              >
                {gpsUnavailableLabel ?? 'GPS data unavailable'}
              </Text>
            </View>
          )}
        </View>

        {/* Bottom: info */}
        <View
          style={{
            flex: 1,
            paddingHorizontal: 64,
            paddingTop: 20,
            paddingBottom: 50,
          }}
        >
          <View>
            <Text
              className="text-white"
              style={{ fontSize: 56, lineHeight: 62, fontWeight: '600', fontStyle: 'italic', letterSpacing: -0.5 }}
            >
              {circuitName}
            </Text>
            {car ? (
              <Text
                className="mt-3"
                style={{ fontSize: 30, color: 'rgba(255,255,255,0.55)', fontWeight: '400' }}
              >
                {car}
              </Text>
            ) : null}
          </View>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text
              className="uppercase"
              style={{ fontSize: 18, fontWeight: '500', letterSpacing: 3, color: 'rgba(255,255,255,0.35)' }}
            >
              {bestLapLabel}
            </Text>
            <Text
              className="text-white"
              style={{
                marginTop: 8,
                fontSize: 96,
                lineHeight: 104,
                fontWeight: '500',
                fontVariant: ['tabular-nums'],
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
              style={{ width: 100, height: 4, borderRadius: 2, marginTop: 20 }}
            />
          </View>

          <View>
            <Text
              className="uppercase"
              style={{ fontSize: 16, fontWeight: '500', letterSpacing: 3, color: 'rgba(255,255,255,0.35)' }}
            >
              {topSpeedLabel}
            </Text>
            <Text
              className="text-white"
              style={{ fontSize: 36, fontWeight: '500', fontVariant: ['tabular-nums'], marginTop: 4 }}
            >
              {topSpeed}
            </Text>
          </View>

          <Text
            className="mt-8 text-center"
            style={{
              fontSize: 30,
              fontWeight: '600',
              fontStyle: 'italic',
              letterSpacing: 1,
              color: 'rgba(255,255,255,0.35)',
              textShadowColor: 'rgba(20,160,180,0.3)',
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

  if (variant === 'photo') {
    return (
      <View style={{ width: 720, height: 1280, backgroundColor: '#000' }}>
        {backgroundImageUri ? (
          <Image
            source={{ uri: backgroundImageUri }}
            style={{ position: 'absolute', width: 720, height: 1280 }}
            resizeMode="contain"
          />
        ) : null}

        {/* Gradient overlay for text readability */}
        <LinearGradient
          colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.65)']}
          locations={[0, 0.4, 1]}
          style={{ position: 'absolute', width: 720, height: 1280 }}
        />

        <View className="flex-1 px-16 pb-24 pt-48">
          {/* Circuit name at top */}
          <View>
            <Text
              className="text-white"
              style={{ fontSize: 52, lineHeight: 58, fontWeight: '800', fontStyle: 'italic', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 }}
            >
              {circuitName}
            </Text>
            <Text
              className="mt-2"
              style={{ fontSize: 24, color: 'rgba(255,255,255,0.7)', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 }}
            >
              {location}
            </Text>
            {car ? (
              <Text
                className="mt-4"
                style={{ fontSize: 32, fontWeight: '600', color: 'rgba(255,255,255,0.6)', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 }}
              >
                {car}
              </Text>
            ) : null}
          </View>

          {/* Best lap hero — pushed to bottom */}
          <View className="mt-auto items-center">
            <Text
              className="uppercase"
              style={{ fontSize: 20, fontWeight: '600', letterSpacing: 4, color: 'rgba(255,255,255,0.6)', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 }}
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
                textShadowColor: 'rgba(0,0,0,0.7)',
                textShadowOffset: { width: 0, height: 2 },
                textShadowRadius: 16,
              }}
            >
              {bestLap}
            </Text>
            <LinearGradient
              colors={['#14b8c8', '#0ea5e9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: 80, height: 4, borderRadius: 2, marginTop: 16 }}
            />
          </View>

          {/* Trakio watermark */}
          <Text
            className="mt-16 text-center"
            style={{ fontSize: 32, fontWeight: '800', fontStyle: 'italic', letterSpacing: 1, color: 'rgba(255,255,255,0.5)', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 12 }}
          >
            Trakio
          </Text>
        </View>
      </View>
    );
  }

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
          {car ? (
            <Text className="mt-4" style={{ fontSize: 32, fontWeight: '600', color: 'rgba(255,255,255,0.4)' }}>
              {car}
            </Text>
          ) : null}
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
