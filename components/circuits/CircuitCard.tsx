import { memo } from "react";
import { View, Text, Pressable } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import i18n from "@/i18n";
import TrackOutlineThumbnail from "@/components/circuits/TrackOutlineThumbnail";
import type { TrackListItem } from "@/db";
import { formatDistanceKm } from "@/utils/format";
import {
  formatTrackDisplayLocation,
  localizeTrack,
} from "@/utils/track-localization";

type Props = {
  circuit: TrackListItem;
  locale: string;
  isDark: boolean;
  distanceMeters?: number | null;
  onPress: (trackId: string) => void;
  onToggleFavorite: (trackId: string) => void;
};

// Where the favorite star sits: inside the card's p-4 padding, at the top of
// the right column, which is inset a further pr-1.
const STAR_TOP = 16;
const STAR_RIGHT = 20;
const STAR_SIZE = 18;

function formatTrackLength(lengthMeters: number | null) {
  if (lengthMeters === null) {
    return i18n.t("common.tbd");
  }

  return `${(lengthMeters / 1000).toFixed(3)} km`;
}

function CircuitCard({
  circuit,
  locale,
  isDark,
  distanceMeters,
  onPress,
  onToggleFavorite,
}: Props) {
  const localized = localizeTrack(circuit, locale);

  return (
    <View className="w-full rounded-3xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10">
      {/* All visual content lives inside the navigation pressable, so screen
          readers announce the card as one button with its full text. The
          favorite star is its sibling, absolutely positioned into its visual
          slot: VoiceOver cannot reach controls nested inside another
          accessible pressable, and a fixed-height spacer keeps its place in
          the layout. */}
      <Pressable
        onPress={() => onPress(circuit.id)}
        accessibilityRole="button"
        className="p-4"
      >
        <View className="flex-row justify-between items-start mb-3">
          <View className="flex-1 mr-3">
            <Text className="text-base font-semibold leading-tight text-zinc-900 dark:text-white">
              {localized.name}
            </Text>
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {formatTrackDisplayLocation(circuit, locale)}
            </Text>
            <View className="mt-1.5 self-start rounded-full px-2 py-0.5 border bg-sky-500/15 border-sky-400/20">
              <Text className="text-xs text-sky-600 dark:text-sky-300">
                {localized.layoutName ?? i18n.t("common.track")}
              </Text>
            </View>
            {distanceMeters != null ? (
              <Text className="mt-1.5 text-xs font-medium text-sky-600 dark:text-sky-400">
                {formatDistanceKm(distanceMeters)}
              </Text>
            ) : null}
          </View>
          <View className="items-end gap-1 pr-1">
            <View style={{ height: STAR_SIZE }} />
            {circuit.path ? (
              <View className="pr-6">
                <TrackOutlineThumbnail
                  path={circuit.path}
                  size={72}
                  color={isDark ? "#d4d4d8" : "#52525b"}
                />
              </View>
            ) : null}
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1 rounded-2xl bg-zinc-50 dark:bg-black/20 border border-zinc-100 dark:border-white/5 px-3 py-2.5">
            <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">
              {i18n.t("circuits.length")}
            </Text>
            <Text className="text-sm font-medium text-zinc-900 dark:text-white">
              {formatTrackLength(circuit.lengthMeters)}
            </Text>
          </View>
          <View className="flex-1 rounded-2xl bg-zinc-50 dark:bg-black/20 border border-zinc-100 dark:border-white/5 px-3 py-2.5">
            <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">
              {i18n.t("circuits.corners")}
            </Text>
            <Text className="text-sm font-medium text-zinc-900 dark:text-white">
              {circuit.corners ?? i18n.t("common.tbd")}
            </Text>
          </View>
        </View>
      </Pressable>
      <Pressable
        onPress={() => onToggleFavorite(circuit.id)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={i18n.t("circuits.toggleFavorite")}
        accessibilityState={{ selected: circuit.isFavorite }}
        className="absolute"
        style={{ top: STAR_TOP, right: STAR_RIGHT }}
      >
        <FontAwesome6
          name="star"
          solid={circuit.isFavorite}
          size={STAR_SIZE}
          color={circuit.isFavorite ? "#f59e0b" : isDark ? "#71717a" : "#a1a1aa"}
        />
      </Pressable>
    </View>
  );
}

export default memo(CircuitCard);
