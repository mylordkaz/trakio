import { Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type { Tone } from './LapClock';

// Outer ring is 1.0 G, inner ring 0.5 G. The dot shows the force the driver
// feels, opposite to the car's acceleration: braking moves it up,
// accelerating moves it down, a right-hand corner moves it left.
const MAX_G = 1.2;

type Props = {
  size: number;
  aligned: boolean;
  lateralSv: SharedValue<number>;
  longitudinalSv: SharedValue<number>;
  tone?: Tone;
};

export function GReadout({ valueG, label, tone = 'dark' }: { valueG: number; label: string; tone?: Tone }) {
  return (
    <View>
      <Text
        className={`text-base font-semibold ${tone === 'dark' ? 'text-white' : 'text-zinc-900'}`}
        style={{ fontVariant: ['tabular-nums'], lineHeight: 18 }}
      >
        {Math.abs(valueG).toFixed(1)} G
      </Text>
      <Text className="text-[10px] tracking-widest text-zinc-500" style={{ lineHeight: 12 }}>
        {label}
      </Text>
    </View>
  );
}

export default function GForceMeter({ size, aligned, lateralSv, longitudinalSv, tone = 'dark' }: Props) {
  const center = size / 2;
  const ringRadius = size / 2 - 1;
  const dotSize = Math.max(8, Math.round(size * 0.12));
  const haloSize = dotSize * 2.6;
  const outer = tone === 'dark' ? '#3f3f46' : '#a1a1aa';
  const inner = tone === 'dark' ? '#27272a' : '#d4d4d8';

  const dotStyle = useAnimatedStyle(() => {
    const lat = Math.max(-MAX_G, Math.min(MAX_G, lateralSv.value));
    const long = Math.max(-MAX_G, Math.min(MAX_G, longitudinalSv.value));
    return {
      transform: [{ translateX: -lat * ringRadius }, { translateY: long * ringRadius }],
    };
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={ringRadius} stroke={outer} strokeWidth={1} fill="none" />
        <Circle cx={center} cy={center} r={ringRadius / 2} stroke={inner} strokeWidth={1} fill="none" />
        <Line x1={0} y1={center} x2={size} y2={center} stroke={inner} strokeWidth={1} />
        <Line x1={center} y1={0} x2={center} y2={size} stroke={inner} strokeWidth={1} />
      </Svg>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: center - haloSize / 2,
            top: center - haloSize / 2,
            width: haloSize,
            height: haloSize,
            borderRadius: haloSize / 2,
            backgroundColor: 'rgba(239, 68, 68, 0.25)',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: aligned ? 1 : 0.35,
          },
          dotStyle,
        ]}
      >
        <View style={{ width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: '#ef4444' }} />
      </Animated.View>
    </View>
  );
}
