import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { formatDeltaMs } from '@/utils/format';

// Fixed scale: ±2.0 s maps to the arc's full half-sweep. Faster is left
// (green), slower is right (red). The marker glides between GPS updates so a
// 1 Hz phone fix does not snap.
const FULL_SCALE_MS = 2000;
const HALF_SWEEP_DEG = 28;
const TICK_STEP_DEG = 7;
const MARKER_SIZE = 6;

type Props = {
  width: number;
  deltaMs: number | null;
  referenceLabel: string;
  dimmed: boolean;
};

export default function DeltaArc({ width, deltaMs, referenceLabel, dimmed }: Props) {
  const halfSweep = (HALF_SWEEP_DEG * Math.PI) / 180;
  const chord = Math.max(0, width - 32);
  const radius = chord / (2 * Math.sin(halfSweep));
  const sagitta = radius * (1 - Math.cos(halfSweep));
  const height = sagitta + 24;
  const cx = width / 2;
  const cy = 12 + radius;

  const angle = useSharedValue(0);
  useEffect(() => {
    const clamped = Math.max(-1, Math.min(1, (deltaMs ?? 0) / FULL_SCALE_MS));
    angle.value = withTiming(clamped * halfSweep, { duration: 300 });
  }, [deltaMs, halfSweep, angle]);

  const markerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cx + radius * Math.sin(angle.value) - MARKER_SIZE / 2 },
      { translateY: cy - radius * Math.cos(angle.value) - 14 },
    ],
  }));

  const point = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
  };
  const start = point(-HALF_SWEEP_DEG, radius);
  const end = point(HALF_SWEEP_DEG, radius);
  const ticks: number[] = [];
  for (let deg = -HALF_SWEEP_DEG; deg <= HALF_SWEEP_DEG + 0.01; deg += TICK_STEP_DEG) {
    ticks.push(deg);
  }
  const hasDelta = deltaMs !== null;
  const isFaster = hasDelta && deltaMs < 0;

  return (
    <View style={{ width, height, opacity: dimmed ? 0.4 : 1 }}>
      <View className="absolute left-0 right-0 items-center" style={{ top: 0 }}>
        <View className="flex-row items-center gap-3">
          {hasDelta ? (
            <Text style={{ fontSize: 22 }} className={isFaster ? 'text-emerald-400' : 'text-red-400'}>
              {isFaster ? '▼' : '▲'}
            </Text>
          ) : null}
          <Text
            style={{ fontSize: 44, lineHeight: 50, fontVariant: ['tabular-nums'] }}
            className={`font-bold ${!hasDelta ? 'text-zinc-500' : isFaster ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {hasDelta ? formatDeltaMs(deltaMs) : '--.---'}
          </Text>
        </View>
        <Text className="text-sm text-zinc-500">{referenceLabel}</Text>
      </View>
      <Svg width={width} height={height} style={{ position: 'absolute', left: 0, bottom: 0 }}>
        <Defs>
          <LinearGradient id="deltaGradient" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#34d399" stopOpacity="1" />
            <Stop offset="0.5" stopColor="#3f3f46" stopOpacity="1" />
            <Stop offset="1" stopColor="#ef4444" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Path
          d={`M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`}
          stroke="url(#deltaGradient)"
          strokeWidth={6}
          strokeLinecap="round"
          fill="none"
        />
        {ticks.map((deg) => {
          const inner = point(deg, radius - 6);
          const outer = point(deg, radius + (Math.abs(deg) < 0.01 ? 16 : 8));
          return (
            <Line
              key={deg}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={Math.abs(deg) < 0.01 ? '#fafafa' : '#52525b'}
              strokeWidth={Math.abs(deg) < 0.01 ? 3 : 2}
            />
          );
        })}
      </Svg>
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', left: 0, top: 0, width: MARKER_SIZE, height: 28, borderRadius: 3, backgroundColor: '#fafafa', opacity: hasDelta ? 1 : 0 },
          markerStyle,
        ]}
      />
    </View>
  );
}
