import { Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type { CarFrameG } from '@/telemetry/car-frame-g';

// Outer ring is 1.0 G, inner ring 0.5 G. The dot shows the force the driver
// feels, opposite to the car's acceleration: braking moves it up,
// accelerating moves it down, a right-hand corner moves it left.
const MAX_G = 1.2;
const DOT_SIZE = 16;
const HALO_SIZE = 44;

type Props = {
  size: number;
  reading: CarFrameG;
  lateralSv: SharedValue<number>;
  longitudinalSv: SharedValue<number>;
  lateralLabel: string;
  longitudinalLabel: string;
  aligningLabel: string;
};

export default function GForceMeter({ size, reading, lateralSv, longitudinalSv, lateralLabel, longitudinalLabel, aligningLabel }: Props) {
  const center = size / 2;
  const ringRadius = size / 2 - 4;
  const pxPerG = ringRadius;

  const dotStyle = useAnimatedStyle(() => {
    const lat = Math.max(-MAX_G, Math.min(MAX_G, lateralSv.value));
    const long = Math.max(-MAX_G, Math.min(MAX_G, longitudinalSv.value));
    return {
      transform: [{ translateX: -lat * pxPerG }, { translateY: long * pxPerG }],
    };
  });

  return (
    <View className="items-center">
      <View className="flex-row items-baseline gap-1 mb-1">
        <Text className="text-lg font-semibold text-white" style={{ fontVariant: ['tabular-nums'] }}>
          {Math.abs(reading.lateralG).toFixed(1)} G
        </Text>
        <Text className="text-xs tracking-widest text-zinc-500">{lateralLabel}</Text>
      </View>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={center} cy={center} r={ringRadius} stroke="#52525b" strokeWidth={1.5} fill="none" />
          <Circle cx={center} cy={center} r={ringRadius / 2} stroke="#3f3f46" strokeWidth={1} fill="none" />
          <Line x1={center - ringRadius} y1={center} x2={center + ringRadius} y2={center} stroke="#3f3f46" strokeWidth={1} />
          <Line x1={center} y1={center - ringRadius} x2={center} y2={center + ringRadius} stroke="#3f3f46" strokeWidth={1} />
        </Svg>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: center - HALO_SIZE / 2,
              top: center - HALO_SIZE / 2,
              width: HALO_SIZE,
              height: HALO_SIZE,
              borderRadius: HALO_SIZE / 2,
              backgroundColor: 'rgba(239, 68, 68, 0.28)',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: reading.aligned ? 1 : 0.35,
            },
            dotStyle,
          ]}
        >
          <View style={{ width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, backgroundColor: '#ef4444' }} />
        </Animated.View>
      </View>
      <View className="flex-row items-baseline gap-1 mt-1">
        <Text className="text-lg font-semibold text-white" style={{ fontVariant: ['tabular-nums'] }}>
          {Math.abs(reading.longitudinalG).toFixed(1)} G
        </Text>
        <Text className="text-xs tracking-widest text-zinc-500">{longitudinalLabel}</Text>
      </View>
      {reading.aligned ? null : <Text className="text-xs text-zinc-500 mt-1">{aligningLabel}</Text>}
    </View>
  );
}
