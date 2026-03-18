import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import i18n from "@/i18n";
import Card from "@/components/Card";
import EditableSessionTitle from "@/components/EditableSessionTitle";
import ProgressBar from "@/components/ProgressBar";
import { getSessionById, updateSessionName } from "@/db";
import type { SessionDetail } from "@/db";
import { useHeaderGradient } from "@/hooks/useHeaderGradient";

function formatLapTime(lapTimeMs: number | null) {
  if (lapTimeMs === null) {
    return "--:--.---";
  }

  const totalSeconds = lapTimeMs / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;

  return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
}

function formatSectorTime(splitTimeMs: number | null) {
  if (splitTimeMs === null) {
    return "--.---";
  }

  return (splitTimeMs / 1000).toFixed(3);
}

function formatDuration(startedAt: string, endedAt: string | null) {
  if (!endedAt) {
    return i18n.t("common.tbd");
  }

  const diffMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return i18n.t("common.tbd");
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatSpeed(maxSpeedKph: number | null) {
  if (maxSpeedKph === null) {
    return i18n.t("common.tbd");
  }

  return `${Math.round(maxSpeedKph)} km/h`;
}

function getSectorCount(sessionDetail: SessionDetail | null) {
  if (!sessionDetail) {
    return 0;
  }

  const sectorLineCount = sessionDetail.timingLines.filter(
    (timingLine) => timingLine.type === "sector",
  ).length;
  const hasStartFinish = sessionDetail.timingLines.some(
    (timingLine) => timingLine.type === "start_finish",
  );

  if (sectorLineCount === 0) {
    return 0;
  }

  return sectorLineCount + (hasStartFinish ? 1 : 0);
}

function getValidTimedLaps(sessionDetail: SessionDetail | null) {
  return (sessionDetail?.laps ?? []).filter(
    (lap) =>
      lap.lapTimeMs !== null && lap.isInvalid === 0 && lap.isOutLap === 0,
  );
}

function getBestLap(sessionDetail: SessionDetail | null) {
  const validTimedLaps = getValidTimedLaps(sessionDetail);
  if (validTimedLaps.length === 0) {
    return null;
  }

  return validTimedLaps.reduce(
    (best, lap) => {
      if (
        !best ||
        (lap.lapTimeMs ?? Number.MAX_SAFE_INTEGER) <
          (best.lapTimeMs ?? Number.MAX_SAFE_INTEGER)
      ) {
        return lap;
      }

      return best;
    },
    null as (typeof validTimedLaps)[number] | null,
  );
}

function getTopSpeedKph(sessionDetail: SessionDetail | null) {
  if (!sessionDetail) {
    return null;
  }

  const speedCandidates = [
    sessionDetail.session.maxSpeedKph,
    ...sessionDetail.laps.map((lap) => lap.maxSpeedKph),
    ...sessionDetail.gpsPoints.map((point) =>
      point.speedMps !== null ? point.speedMps * 3.6 : null,
    ),
  ].filter((value): value is number => value !== null);

  if (speedCandidates.length === 0) {
    return null;
  }

  return Math.max(...speedCandidates);
}

function getTheoreticalBestMs(sessionDetail: SessionDetail | null) {
  const validTimedLaps = getValidTimedLaps(sessionDetail);
  const sectorCount = getSectorCount(sessionDetail);

  if (validTimedLaps.length === 0 || sectorCount === 0) {
    return null;
  }

  const bestSectors = Array.from({ length: sectorCount }, (_, index) => {
    const candidates = validTimedLaps
      .map(
        (lap) =>
          lap.sectors.find((sector) => sector.sectorIndex === index)
            ?.splitTimeMs ?? null,
      )
      .filter((value): value is number => value !== null);

    return candidates.length > 0 ? Math.min(...candidates) : null;
  });

  if (bestSectors.some((value) => value === null)) {
    return null;
  }

  return bestSectors
    .filter((value): value is number => value !== null)
    .reduce((sum, value) => sum + value, 0);
}

function getConsistencyValue(sessionDetail: SessionDetail | null) {
  const validTimedLaps = getValidTimedLaps(sessionDetail);

  if (validTimedLaps.length < 2) {
    return 100;
  }

  const lapTimes = validTimedLaps.map((lap) => lap.lapTimeMs ?? 0);
  const average =
    lapTimes.reduce((sum, value) => sum + value, 0) / lapTimes.length;
  const spread = Math.max(...lapTimes) - Math.min(...lapTimes);
  const score = 100 - (spread / average) * 100;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getAverageLapDeltaLabel(sessionDetail: SessionDetail | null) {
  const validTimedLaps = getValidTimedLaps(sessionDetail);

  if (validTimedLaps.length < 2) {
    return i18n.t("common.tbd");
  }

  const deltas = validTimedLaps.slice(1).map((lap, index) => {
    const previousLap = validTimedLaps[index];
    return (lap.lapTimeMs ?? 0) - (previousLap.lapTimeMs ?? 0);
  });
  const averageDelta =
    deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  const sign = averageDelta >= 0 ? "+" : "−";

  return `${sign}${(Math.abs(averageDelta) / 1000).toFixed(1)}s`;
}

function getTrendBars(sessionDetail: SessionDetail | null) {
  const validTimedLaps = getValidTimedLaps(sessionDetail);

  if (validTimedLaps.length === 0) {
    return [];
  }

  const lapTimes = validTimedLaps.map((lap) => lap.lapTimeMs ?? 0);
  const fastest = Math.min(...lapTimes);
  const slowest = Math.max(...lapTimes);
  const range = slowest - fastest;

  return validTimedLaps.map((lap) => ({
    lap: lap.lapNumber,
    best: lap.lapTimeMs === fastest,
    height:
      range === 0
        ? 100
        : Math.round(
            55 + ((slowest - (lap.lapTimeMs ?? slowest)) / range) * 45,
          ),
  }));
}

export default function PostSessionScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const gradientColors = useHeaderGradient("emerald");
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function handleChangeTitle(newTitle: string) {
    if (!sessionDetail) return;
    await updateSessionName(db, sessionDetail.session.id, newTitle);
    setSessionDetail({
      ...sessionDetail,
      session: { ...sessionDetail.session, name: newTitle },
    });
  }

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      if (!params.id) {
        if (isMounted) {
          setLoadError(i18n.t("sessions.sessionNotFound"));
          setIsLoading(false);
        }
        return;
      }

      try {
        setIsLoading(true);
        const nextSession = await getSessionById(db, params.id);

        if (!isMounted) {
          return;
        }

        if (!nextSession) {
          setSessionDetail(null);
          setLoadError(i18n.t("sessions.sessionNotFound"));
          return;
        }

        setSessionDetail(nextSession);
        setLoadError(null);
      } catch {
        if (!isMounted) {
          return;
        }

        setLoadError(i18n.t("sessions.unableToLoadSession"));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      isMounted = false;
    };
  }, [db, params.id]);

  const bestLap = useMemo(() => getBestLap(sessionDetail), [sessionDetail]);
  const bestLapMs =
    bestLap?.lapTimeMs ?? sessionDetail?.session.bestLapMs ?? null;
  const sectorCount = getSectorCount(sessionDetail);
  const theoreticalBestMs = getTheoreticalBestMs(sessionDetail);
  const consistency = getConsistencyValue(sessionDetail);
  const topSpeedKph = getTopSpeedKph(sessionDetail);
  const trendBars = getTrendBars(sessionDetail);
  const totalLaps = getValidTimedLaps(sessionDetail).length;

  return (
    <View className="flex-1 bg-zinc-50 dark:bg-zinc-900 overflow-hidden">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={gradientColors}
          locations={[0, 0.5, 1]}
          style={{
            paddingTop: insets.top + 20,
            paddingHorizontal: 20,
            paddingBottom: 16,
          }}
        >
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">
              {sessionDetail?.track.name ?? i18n.t("circuits.loadingTrack")}
            </Text>
            <View className="flex-row items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 border border-emerald-400/20">
              <View className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <Text className="text-sm text-emerald-400">
                {i18n.t("session.saved")}
              </Text>
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {i18n.t("postSession.title")}
            </Text>
            <EditableSessionTitle
              title={sessionDetail?.session.name ?? i18n.t("sessions.sessionNotFound")}
              onChangeTitle={handleChangeTitle}
            />
          </View>

          {isLoading ? (
            <View className="mb-4 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 py-3">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                {i18n.t("sessions.loadingSession")}
              </Text>
            </View>
          ) : null}

          {loadError ? (
            <View className="mb-4 rounded-2xl bg-red-500/10 border border-red-500/20 px-3 py-3">
              <Text className="text-sm text-red-700 dark:text-red-200">
                {loadError}
              </Text>
            </View>
          ) : null}

          <View className="rounded-3xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10 p-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                {i18n.t("session.bestLap")}
              </Text>
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                {i18n.t("session.lapCount", { count: totalLaps })}
              </Text>
            </View>
            <Text
              className="text-zinc-900 dark:text-white mb-3 text-center"
              style={{
                fontSize: 56,
                lineHeight: 56,
                fontWeight: "600",
                fontVariant: ["tabular-nums"],
              }}
            >
              {formatLapTime(bestLapMs)}
            </Text>
            <View className="flex-row gap-2">
              {Array.from({ length: sectorCount }, (_, index) => {
                const sectorTime =
                  bestLap?.sectors.find(
                    (sector) => sector.sectorIndex === index,
                  )?.splitTimeMs ?? null;

                return (
                  <View
                    key={`best-sector-${index + 1}`}
                    className="flex-1 rounded-2xl p-3 border bg-emerald-500/10 border-emerald-400/30"
                  >
                    <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{`S${index + 1}`}</Text>
                    <Text className="text-lg font-medium text-zinc-900 dark:text-white">
                      {formatSectorTime(sectorTime)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </LinearGradient>

        <View className="px-5 py-4 gap-4">
          <View className="flex-row gap-3">
            {[
              [i18n.t("session.topSpeed"), formatSpeed(topSpeedKph)],
              [
                i18n.t("session.duration"),
                sessionDetail
                  ? formatDuration(
                      sessionDetail.session.startedAt,
                      sessionDetail.session.endedAt,
                    )
                  : i18n.t("common.tbd"),
              ],
              [i18n.t("session.totalLaps"), `${totalLaps}`],
            ].map(([label, value]) => (
              <View
                key={label}
                className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3"
              >
                <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                  {label}
                </Text>
                <Text className="text-lg font-semibold text-zinc-900 dark:text-white">
                  {value}
                </Text>
              </View>
            ))}
          </View>

          <Card>
            <View className="mb-4">
              <Text className="text-sm font-medium text-zinc-900 dark:text-white">
                {i18n.t("sessions.sessionInsights")}
              </Text>
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                {i18n.t("sessions.performanceSummary")}
              </Text>
            </View>

            <View className="mb-4">
              <ProgressBar
                label={i18n.t("postSession.consistency")}
                value={`${consistency}%`}
                color="bg-white dark:bg-white"
              />
            </View>

            <View className="mb-4">
              <View className="flex-row justify-between mb-1">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  {i18n.t("sessions.theoreticalBest")}
                </Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatLapTime(theoreticalBestMs)}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="flex-1 h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
                  <View
                    className="h-full rounded-full bg-emerald-400"
                    style={{
                      width:
                        bestLapMs !== null &&
                        theoreticalBestMs !== null &&
                        bestLapMs > 0
                          ? `${Math.max(5, Math.min(100, Math.round((theoreticalBestMs / bestLapMs) * 100)))}%`
                          : "0%",
                    }}
                  />
                </View>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  {theoreticalBestMs !== null && bestLapMs !== null
                    ? i18n.t("sessions.gap", {
                        gap: ((bestLapMs - theoreticalBestMs) / 1000).toFixed(
                          3,
                        ),
                      })
                    : i18n.t("common.tbd")}
                </Text>
              </View>
              <Text className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                {i18n.t("sessions.bestSectorsCombined")}
              </Text>
            </View>

            <View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  {i18n.t("sessions.lapDeltaTrend")}
                </Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  {i18n.t("sessions.avgPerLap", {
                    delta: getAverageLapDeltaLabel(sessionDetail),
                  })}
                </Text>
              </View>
              {trendBars.length > 0 ? (
                <>
                  <View className="flex-row gap-1.5 items-end h-16">
                    {trendBars.map((bar) => (
                      <View key={bar.lap} className="flex-1 items-center">
                        <View
                          className={`w-full rounded-md ${bar.best ? "bg-emerald-400" : "bg-zinc-300 dark:bg-zinc-700"}`}
                          style={{ height: `${bar.height}%` }}
                        />
                      </View>
                    ))}
                  </View>
                  <View className="flex-row justify-between mt-1">
                    <Text className="text-xs text-zinc-400 dark:text-zinc-500">
                      {i18n.t("sessions.lapLabel", {
                        number: trendBars[0]?.lap ?? 0,
                      })}
                    </Text>
                    <Text className="text-xs text-zinc-400 dark:text-zinc-500">
                      {i18n.t("sessions.lapLabel", {
                        number: trendBars[trendBars.length - 1]?.lap ?? 0,
                      })}
                    </Text>
                  </View>
                </>
              ) : (
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                  {i18n.t("sessions.noLapDataYet")}
                </Text>
              )}
            </View>
          </Card>

          <Card>
            <Text className="text-sm font-medium text-zinc-900 dark:text-white mb-3">
              {i18n.t("postSession.lapBreakdown")}
            </Text>
            {getValidTimedLaps(sessionDetail).length > 0 ? (
              <View className="gap-2">
                {getValidTimedLaps(sessionDetail).map((lap) => {
                  const isBest = bestLap?.id === lap.id;

                  return (
                    <View
                      key={lap.id}
                      className={`flex-row items-center justify-between rounded-2xl px-4 py-3 border ${
                        isBest
                          ? "bg-emerald-500/10 border-emerald-400/30"
                          : "bg-zinc-50 dark:bg-black/20 border-zinc-100 dark:border-white/5"
                      }`}
                    >
                      <View className="flex-row items-center gap-2">
                        <Text className="text-sm font-medium text-zinc-900 dark:text-white">
                          {i18n.t("sessions.lapLabel", {
                            number: lap.lapNumber,
                          })}
                        </Text>
                        {isBest ? (
                          <Text className="text-xs font-medium text-emerald-400">
                            {i18n.t("sessions.best")}
                          </Text>
                        ) : null}
                      </View>
                      <Text
                        className="text-sm font-semibold text-zinc-900 dark:text-white"
                        style={{ fontVariant: ["tabular-nums"] }}
                      >
                        {formatLapTime(lap.lapTimeMs)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                {i18n.t("sessions.noLapDataYet")}
              </Text>
            )}
          </Card>
        </View>

        <View className="px-5 pb-5 pt-1 flex-row gap-3">
          <Pressable
            onPress={() => router.replace("/(tabs)/sessions")}
            className="flex-1 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 py-3.5 items-center"
          >
            <Text className="text-sm font-medium text-zinc-900 dark:text-white">
              {i18n.t("postSession.viewSessions")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace("/(tabs)/record")}
            className="flex-1 rounded-2xl bg-emerald-500 py-3.5 items-center"
          >
            <Text className="text-sm font-semibold text-black">
              {i18n.t("session.newSession")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
