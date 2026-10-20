import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from 'react-native-reanimated';
import { formatLapTime } from '@/utils/format';

const TICK_MS = 50;

export type Tone = 'dark' | 'light';

type Props = {
  fontSize: number;
  tone?: Tone;
  waitingLabel: string;
  // Wall-clock start of the lap in progress; null while armed.
  startedWallClockMs: number | null;
};

// Owns its own tick so the 20 Hz re-render stays inside this component.
export default function LapClock({ fontSize, tone = 'dark', waitingLabel, startedWallClockMs }: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const pulse = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  useEffect(() => {
    if (startedWallClockMs === null) {
      pulse.value = withRepeat(withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
      return () => cancelAnimation(pulse);
    }
    cancelAnimation(pulse);
    pulse.value = 1;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [startedWallClockMs, pulse]);

  if (startedWallClockMs === null) {
    return (
      <Animated.Text
        numberOfLines={1}
        style={[{ fontSize: Math.round(fontSize * 0.3), lineHeight: Math.round(fontSize * 1.05) }, pulseStyle]}
        className="font-medium text-zinc-500"
      >
        {waitingLabel}
      </Animated.Text>
    );
  }

  return (
    <Text
      numberOfLines={1}
      style={{ fontSize, lineHeight: Math.round(fontSize * 1.05), fontVariant: ['tabular-nums'], letterSpacing: -fontSize * 0.02 }}
      className={`font-bold ${tone === 'dark' ? 'text-white' : 'text-zinc-900'}`}
    >
      {formatLapTime(Math.max(0, nowMs - startedWallClockMs))}
    </Text>
  );
}
