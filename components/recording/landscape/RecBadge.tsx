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

// Tapping the badge reveals Pit In and End for a few seconds so the
// dashboard stays clean while driving and a stray touch cannot stop a session.
export default function RecBadge({ label, pitInLabel, pitInDoneLabel, endLabel, pitInMarked, onPitIn, onEnd }: Props) {
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.45, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);

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
    <View className="flex-row items-center gap-3">
      {controlsVisible ? (
        <>
          <Pressable
            onPress={() => {
              setControlsVisible(false);
              onPitIn();
            }}
            disabled={pitInMarked}
            className={`rounded-full px-5 py-2.5 border ${pitInMarked ? 'bg-amber-500/10 border-amber-400/20' : 'bg-amber-500/15 border-amber-400/30'}`}
          >
            <Text className={`text-base font-semibold ${pitInMarked ? 'text-amber-400/50' : 'text-amber-400'}`}>
              {pitInMarked ? pitInDoneLabel : pitInLabel}
            </Text>
          </Pressable>
          <Pressable onPress={onEnd} className="rounded-full bg-red-500 px-5 py-2.5">
            <Text className="text-base font-semibold text-white">{endLabel}</Text>
          </Pressable>
        </>
      ) : null}
      <Pressable onPress={() => setControlsVisible((visible) => !visible)} hitSlop={12}>
        <Animated.View
          style={pulseStyle}
          className="flex-row items-center gap-2 rounded-full bg-red-500/15 px-4 py-2 border border-red-400/20"
        >
          <View className="h-3 w-3 rounded-full bg-red-400" />
          <Text className="text-base font-semibold text-red-400">{label}</Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}
