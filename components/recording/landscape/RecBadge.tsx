import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from 'react-native-reanimated';

const CONTROLS_VISIBLE_MS = 4000;

type Props = {
  label: string;
  pitInLabel: string;
  pitInDoneLabel: string;
  endLabel: string;
  pitInMarked: boolean;
  onPitIn: () => void;
  onEnd: () => void;
};

// Pulsing REC pill shared by both orientations.
export function RecPill({ label }: { label: string }) {
  const pulse = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.5, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);

  return (
    <Animated.View
      style={pulseStyle}
      className="flex-row items-center rounded-full bg-red-500/10 px-3.5 py-1.5 border border-red-500/40"
    >
      <View className="h-2.5 w-2.5 rounded-full bg-red-500 mr-2" />
      <Text className="text-sm font-semibold text-red-400">{label}</Text>
    </Animated.View>
  );
}

// Tapping the badge reveals Pit In and End above it for a few seconds, so the
// dashboard stays clean while driving and a stray touch cannot stop a session.
export default function RecBadge({ label, pitInLabel, pitInDoneLabel, endLabel, pitInMarked, onPitIn, onEnd }: Props) {
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!controlsVisible) {
      return;
    }
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_VISIBLE_MS);
    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, [controlsVisible]);

  return (
    <View>
      {controlsVisible ? (
        <View className="absolute right-0 items-end" style={{ bottom: 44, gap: 8, width: 160 }}>
          <Pressable
            onPress={() => {
              setControlsVisible(false);
              onPitIn();
            }}
            disabled={pitInMarked}
            className={`rounded-full px-5 py-2 border ${pitInMarked ? 'bg-zinc-900 border-amber-400/20' : 'bg-zinc-900 border-amber-400/40'}`}
          >
            <Text className={`text-sm font-semibold ${pitInMarked ? 'text-amber-400/50' : 'text-amber-400'}`}>
              {pitInMarked ? pitInDoneLabel : pitInLabel}
            </Text>
          </Pressable>
          <Pressable onPress={onEnd} className="rounded-full bg-red-500 px-5 py-2">
            <Text className="text-sm font-semibold text-white">{endLabel}</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable onPress={() => setControlsVisible((visible) => !visible)} hitSlop={12}>
        <RecPill label={label} />
      </Pressable>
    </View>
  );
}
