import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from 'react-native-reanimated';
import { formatLapTime } from '@/utils/format';

const TICK_MS = 50;

type Props = {
  label: string;
  waitingLabel: string;
  // Wall-clock start of the lap in progress; null while armed.
  startedWallClockMs: number | null;
};

// Owns its own tick so the 20 Hz re-render stays inside this component.
export default function LapClock({ label, waitingLabel, startedWallClockMs }: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const pulse = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  useEffect(() => {
    if (startedWallClockMs === null) {
      pulse.value = withRepeat(withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
      return () => cancelAnimation(pulse);
    }
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [startedWallClockMs, pulse]);

  return (
    <View className="items-center">
      <Text className="text-base tracking-widest text-zinc-500 uppercase">{label}</Text>
      {startedWallClockMs === null ? (
        <Animated.Text style={[{ fontSize: 30, lineHeight: 40 }, pulseStyle]} className="font-medium text-zinc-500 mt-3">
          {waitingLabel}
        </Animated.Text>
      ) : (
        <Text
          style={{ fontSize: 112, lineHeight: 118, fontVariant: ['tabular-nums'] }}
          className="font-bold text-white tracking-tight"
        >
          {formatLapTime(Math.max(0, nowMs - startedWallClockMs))}
        </Text>
      )}
    </View>
  );
}
