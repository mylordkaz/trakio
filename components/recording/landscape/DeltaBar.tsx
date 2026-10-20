import { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { Tone } from './LapClock';

// Thin, slightly bowed scale centred on zero. Fixed scale: ±2.0 s reaches the
// ends. Faster is left (green), slower is right (red). The white marker glides
// between GPS updates so a 1 Hz phone fix does not snap.
const FULL_SCALE_MS = 2000;
const HEIGHT = 46;
const BASELINE_Y = 40; // y of the bar's ends
const BOW = 22; // how much higher the middle sits than the ends
const TICKS = 17;
const MARKER_HEIGHT = 20;

// Quadratic bow: x runs linearly with t, so y depends on t only.
function bowY(t: number) {
  'worklet';
  return BASELINE_Y - 4 * BOW * t * (1 - t);
}

type Props = {
  deltaMs: number | null;
  dimmed: boolean;
  tone?: Tone;
};

export default function DeltaBar({ deltaMs, dimmed, tone = 'dark' }: Props) {
  const tickColor = tone === 'dark' ? '#3f3f46' : '#d4d4d8';
  const centerColor = tone === 'dark' ? '#52525b' : '#a1a1aa';
  const markerColor = tone === 'dark' ? '#fafafa' : '#18181b';
  const [width, setWidth] = useState(0);
  const position = useSharedValue(0.5);

  useEffect(() => {
    const clamped = Math.max(-1, Math.min(1, (deltaMs ?? 0) / FULL_SCALE_MS));
    position.value = withTiming(0.5 + clamped / 2, { duration: 300 });
  }, [deltaMs, position]);

  const markerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: position.value * width - 1.5 },
      { translateY: bowY(position.value) - MARKER_HEIGHT + 3 },
    ],
  }));

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const hasDelta = deltaMs !== null;

  return (
    <View onLayout={onLayout} style={{ height: HEIGHT, opacity: dimmed ? 0.45 : 1 }}>
      {width > 0 ? (
        <>
          <Svg width={width} height={HEIGHT}>
            <Defs>
              <LinearGradient id="deltaBar" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#10b981" stopOpacity="0.08" />
                <Stop offset="0.49" stopColor="#34d399" stopOpacity="1" />
                <Stop offset="0.5" stopColor={centerColor} stopOpacity="1" />
                <Stop offset="0.51" stopColor="#f87171" stopOpacity="1" />
                <Stop offset="1" stopColor="#ef4444" stopOpacity="0.08" />
              </LinearGradient>
            </Defs>
            <Path
              d={`M 0 ${BASELINE_Y} Q ${width / 2} ${BASELINE_Y - 2 * BOW} ${width} ${BASELINE_Y}`}
              stroke="url(#deltaBar)"
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />
            {Array.from({ length: TICKS }, (_, i) => {
              const t = (i + 1) / (TICKS + 1);
              if (Math.abs(t - 0.5) < 0.001) {
                return null;
              }
              const y = bowY(t);
              return <Line key={i} x1={t * width} y1={y - 3} x2={t * width} y2={y - 9} stroke={tickColor} strokeWidth={1} />;
            })}
          </Svg>
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                width: 3,
                height: MARKER_HEIGHT,
                borderRadius: 1.5,
                backgroundColor: hasDelta ? markerColor : '#71717a',
              },
              markerStyle,
            ]}
          />
        </>
      ) : null}
    </View>
  );
}
