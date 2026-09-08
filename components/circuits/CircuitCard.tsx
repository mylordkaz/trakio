import { memo } from "react";
import { View, Text, Pressable } from "react-native";
import i18n from "@/i18n";
import StatusPill from "@/components/StatusPill";
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
};

function formatTrackLength(lengthMeters: number | null) {
  if (lengthMeters === null) {
    return i18n.t("common.tbd");
  }

  return `${(lengthMeters / 1000).toFixed(3)} km`;
}

function CircuitCard({ circuit, locale, isDark, distanceMeters, onPress }: Props) {
  const localized = localizeTrack(circuit, locale);

  return (
    <Pressable
      onPress={() => onPress(circuit.id)}
      className="w-full rounded-3xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-4"
    >
      <View className="flex-row justify-between items-start mb-3">
        <View className="flex-1 mr-3">
          <Text className="text-base font-semibold leading-tight text-zinc-900 dark:text-white">
            {localized.name}
          </Text>
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            {formatTrackDisplayLocation(circuit, locale)}
          </Text>
          {distanceMeters != null ? (
            <Text className="mt-1 text-xs font-medium text-sky-600 dark:text-sky-400">
              {formatDistanceKm(distanceMeters)}
            </Text>
          ) : null}
        </View>
        <View className="items-end gap-2">
          <StatusPill
            text={localized.layoutName ?? i18n.t("common.track")}
            color="sky"
          />
          {circuit.path ? (
            <TrackOutlineThumbnail
              path={circuit.path}
              size={56}
              color={isDark ? "#d4d4d8" : "#52525b"}
            />
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
  );
}

export default memo(CircuitCard);
