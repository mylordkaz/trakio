import { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { LocationSubscription } from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import i18n from '@/i18n';
import Card from '@/components/Card';
import LapRow from '@/components/LapRow';
import ProgressBar from '@/components/ProgressBar';
import { createSessionRecorder, getTrackById } from '@/db';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';
import {
  requestForegroundLocationPermission,
  startLocationSubscription,
  stopLocationSubscription,
} from '@/telemetry/location';
import { createSessionRuntime } from '@/telemetry/session-runtime';
import type { TrackDetail } from '@/db';
import type { TelemetrySample } from '@/telemetry/types';

function formatLapTime(lapTimeMs: number | null) {
  if (lapTimeMs === null) {
    return '--:--.---';
  }

  const totalSeconds = lapTimeMs / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;

  return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
}

function formatDuration(elapsedMs: number | null) {
  if (elapsedMs === null) {
    return '0:00';
  }

  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatSectorTime(elapsedMs: number | null) {
  if (elapsedMs === null) {
    return '--.---';
  }

  const totalSeconds = Math.max(0, elapsedMs / 1000);
  return totalSeconds.toFixed(3).padStart(6, '0');
}

function formatSpeed(speedKph: number | null) {
  if (speedKph === null) {
    return i18n.t('common.tbd');
  }

  return `${Math.round(speedKph)} km/h`;
}

function getGpsSignalPercent(accuracyM: number | null) {
  if (accuracyM === null) {
    return 0;
  }

  if (accuracyM <= 5) {
    return 100;
  }

  if (accuracyM >= 50) {
    return 10;
  }

  return Math.max(10, Math.min(100, Math.round(100 - ((accuracyM - 5) / 45) * 90)));
}

function getGpsSignalLabel(accuracyM: number | null) {
  return `${getGpsSignalPercent(accuracyM)}%`;
}

function getBrakePercent(
  previousSample: TelemetrySample | null,
  currentSample: TelemetrySample | null
) {
  if (!previousSample || !currentSample) {
    return 0;
  }

  if (previousSample.speedMps === null || currentSample.speedMps === null) {
    return 0;
  }

  const elapsedMs = currentSample.elapsedMs - previousSample.elapsedMs;
  if (elapsedMs <= 0) {
    return 0;
  }

  const deltaSpeedMps = currentSample.speedMps - previousSample.speedMps;
  if (deltaSpeedMps >= 0) {
    return 0;
  }

  const decelerationMps2 = Math.abs(deltaSpeedMps) / (elapsedMs / 1000);
  const percent = Math.round((decelerationMps2 / 6) * 100);

  return Math.max(0, Math.min(100, percent));
}

export default function RecordingScreen() {
  useKeepAwake();
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ trackId?: string; sessionName?: string }>();
  const gradientColors = useHeaderGradient('red');
  const [track, setTrack] = useState<TrackDetail | null>(null);
  const [isLoadingTrack, setIsLoadingTrack] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [brakePercent, setBrakePercent] = useState(0);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ReturnType<ReturnType<typeof createSessionRuntime>['getSnapshot']> | null>(null);
  const runtimeRef = useRef<ReturnType<typeof createSessionRuntime> | null>(null);
  const locationSubscriptionRef = useRef<LocationSubscription | null>(null);
  const hasStoppedRef = useRef(false);
  const pulseOpacity = useRef(new Animated.Value(1)).current;
  const previousAcceptedSampleRef = useRef<TelemetrySample | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadTrack() {
      if (!params.trackId) {
        if (isMounted) {
          setLoadError(i18n.t('circuits.unableToLoadTrack'));
          setIsLoadingTrack(false);
        }
        return;
      }

      try {
        setIsLoadingTrack(true);
        const nextTrack = await getTrackById(db, params.trackId);

        if (!isMounted) {
          return;
        }

        if (!nextTrack) {
          setLoadError(i18n.t('circuits.unableToLoadTrack'));
          setTrack(null);
          return;
        }

        setTrack(nextTrack);
        setLoadError(null);
      } catch {
        if (!isMounted) {
          return;
        }

        setLoadError(i18n.t('circuits.unableToLoadTrack'));
      } finally {
        if (isMounted) {
          setIsLoadingTrack(false);
        }
      }
    }

    void loadTrack();

    return () => {
      isMounted = false;
    };
  }, [db, params.trackId]);

  useEffect(() => {
    let isMounted = true;

    async function startRecordingSession() {
      if (!track) {
        return;
      }

      const permissionState = await requestForegroundLocationPermission();
      if (!isMounted) {
        return;
      }

      if (permissionState !== 'granted') {
        setLoadError('Location permission is required to record a session.');
        return;
      }

      const recorder = createSessionRecorder(db);
      const runtime = createSessionRuntime({
        track,
        timingLines: track.timingLines,
        recorder,
        config: {
          sessionName: params.sessionName ?? null,
        },
      });

      runtimeRef.current = runtime;

      const startedSnapshot = await runtime.start();
      if (!isMounted) {
        return;
      }

      setRuntimeSnapshot(startedSnapshot);

      locationSubscriptionRef.current = await startLocationSubscription({
        resolveElapsedMs: (recordedAt) =>
          Math.max(0, recordedAt - (startedSnapshot.sessionStartedAtMs ?? recordedAt)),
        onSample: (sample) => {
          const activeRuntime = runtimeRef.current;

          if (!activeRuntime || !isMounted) {
            return;
          }

          void activeRuntime.handleSample(sample).then((result) => {
            if (!isMounted) {
              return;
            }

            setRuntimeSnapshot(result.snapshot);
          }).catch(() => {
            if (!isMounted) {
              return;
            }

            setLoadError('Unable to process telemetry sample.');
          });
        },
        onError: () => {
          if (!isMounted) {
            return;
          }

          setLoadError('Location subscription error.');
        },
      });
    }

    void startRecordingSession();

    return () => {
      isMounted = false;
      stopLocationSubscription(locationSubscriptionRef.current);
      locationSubscriptionRef.current = null;

      const activeRuntime = runtimeRef.current;
      if (activeRuntime && !hasStoppedRef.current) {
        void activeRuntime.stop().catch(() => undefined);
      }
    };
  }, [db, params.sessionName, track]);

  useEffect(() => {
    const sessionStartedAtMs = runtimeSnapshot?.sessionStartedAtMs;

    if (!sessionStartedAtMs || runtimeSnapshot?.sessionEndedAtMs !== null) {
      return;
    }

    const intervalId = setInterval(() => {
      setNowMs(Date.now());
    }, 50);

    return () => {
      clearInterval(intervalId);
    };
  }, [runtimeSnapshot?.sessionEndedAtMs, runtimeSnapshot?.sessionStartedAtMs]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          toValue: 0.45,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
      pulseOpacity.setValue(1);
    };
  }, [pulseOpacity]);

  useEffect(() => {
    const currentSample = runtimeSnapshot?.latestAcceptedSample ?? null;

    if (!currentSample) {
      previousAcceptedSampleRef.current = null;
      setBrakePercent(0);
      return;
    }

    setBrakePercent(getBrakePercent(previousAcceptedSampleRef.current, currentSample));
    previousAcceptedSampleRef.current = currentSample;
  }, [runtimeSnapshot?.latestAcceptedSample]);

  const sectorCount = track?.sectorCount ?? 0;
  const sessionDurationMs =
    runtimeSnapshot?.sessionStartedAtMs !== null && runtimeSnapshot?.sessionStartedAtMs !== undefined
      ? (runtimeSnapshot.sessionEndedAtMs ?? nowMs) - runtimeSnapshot.sessionStartedAtMs
      : null;
  const currentElapsedMs =
    runtimeSnapshot?.status === 'lap_in_progress' &&
    runtimeSnapshot.currentLapStartedElapsedMs !== null &&
    runtimeSnapshot.sessionStartedAtMs !== null
      ? Math.max(
          0,
          nowMs - (runtimeSnapshot.sessionStartedAtMs + runtimeSnapshot.currentLapStartedElapsedMs)
        )
      : null;
  const currentLapLabel =
    runtimeSnapshot?.status === 'lap_in_progress'
      ? runtimeSnapshot.currentLapNumber
      : runtimeSnapshot?.status === 'armed'
        ? 1
        : 0;
  const currentSpeedKph =
    runtimeSnapshot?.latestAcceptedSample?.speedMps !== null &&
    runtimeSnapshot?.latestAcceptedSample?.speedMps !== undefined
      ? runtimeSnapshot.latestAcceptedSample.speedMps * 3.6
      : null;
  const currentSectorElapsedMs =
    runtimeSnapshot?.status === 'lap_in_progress' &&
    runtimeSnapshot.currentSectorStartedElapsedMs !== null &&
    runtimeSnapshot.sessionStartedAtMs !== null
      ? Math.max(
          0,
          nowMs - (runtimeSnapshot.sessionStartedAtMs + runtimeSnapshot.currentSectorStartedElapsedMs)
        )
      : null;
  const recentLaps = (runtimeSnapshot?.completedLaps ?? []).map((lap) => ({
    lap: lap.lapNumber,
    time: formatLapTime(lap.lapTimeMs),
    delta:
      lap.isBest || lap.deltaToBestMs === null
        ? 'Best'
        : `+${(lap.deltaToBestMs / 1000).toFixed(3)}`,
  }));

  async function handleEndSession() {
    const activeRuntime = runtimeRef.current;

    stopLocationSubscription(locationSubscriptionRef.current);
    locationSubscriptionRef.current = null;

    if (activeRuntime && !hasStoppedRef.current) {
      hasStoppedRef.current = true;
      const stoppedSnapshot = await activeRuntime.stop();
      setRuntimeSnapshot(stoppedSnapshot);
      router.replace({
        pathname: '/(tabs)/record/post-session',
        params: { id: stoppedSnapshot.sessionId ?? '' },
      });
      return;
    }

    router.replace('/(tabs)/record/post-session');
  }

  return (
    <View className="flex-1 bg-zinc-50 dark:bg-zinc-900 overflow-hidden">
      {/* Fixed top: header + current lap + buttons */}
      <LinearGradient
        colors={gradientColors}
        locations={[0, 0.5, 1]}
        style={{
          paddingTop: insets.top + 20,
          paddingHorizontal: 20,
          paddingBottom: 16,
        }}
      >
        {/* Header */}
        <View className="flex-row items-start justify-between mb-3">
          <Text className="text-xs text-zinc-500 dark:text-zinc-400">{track?.name ?? i18n.t('circuits.loadingTrack')}</Text>
          <Animated.View style={{ opacity: pulseOpacity }}>
            <View className="flex-row items-center gap-2 rounded-full bg-red-500/15 px-3 py-1.5 border border-red-400/20">
              <View className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <Text className="text-sm text-red-400">{i18n.t('session.recording')}</Text>
            </View>
          </Animated.View>
        </View>

        {/* Title + REC badge */}
        <View className="flex-row items-start justify-between mb-4">
          <View className="flex-1 mr-3">
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('recording.sessionRecording')}</Text>
            <Text className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
              {params.sessionName ?? track?.layoutName ?? i18n.t('recording.sessionRecording')}
            </Text>
          </View>
          <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-0.5 pr-1">
            {formatDuration(sessionDurationMs)}
          </Text>
        </View>

        {isLoadingTrack ? (
          <View className="mb-4 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 py-3">
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('circuits.loadingTrack')}</Text>
          </View>
        ) : null}

        {loadError ? (
          <View className="mb-4 rounded-2xl bg-red-500/10 border border-red-500/20 px-3 py-3">
            <Text className="text-sm text-red-700 dark:text-red-200">{loadError}</Text>
          </View>
        ) : null}

        {/* Current lap card */}
        <View className="rounded-3xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10 p-4">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('session.currentLap')}</Text>
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {i18n.t('session.lapCount', { count: currentLapLabel })}
            </Text>
          </View>
          {runtimeSnapshot?.status === 'lap_in_progress' ? (
            <Text
              className="text-zinc-900 dark:text-white mb-3 text-center"
              style={{ fontSize: 56, lineHeight: 56, fontWeight: '600', fontVariant: ['tabular-nums'] }}
            >
              {formatLapTime(currentElapsedMs)}
            </Text>
          ) : (
            <Animated.Text
              className="text-zinc-500 dark:text-zinc-400 mb-3 text-center"
              style={{ fontSize: 24, lineHeight: 32, fontWeight: '500', opacity: pulseOpacity }}
            >
              {i18n.t('recording.waitingForStartLine')}
            </Animated.Text>
          )}
          <View className="flex-row gap-2">
            {Array.from({ length: sectorCount }, (_, index) => {
              const isActive =
                runtimeSnapshot?.status === 'lap_in_progress' &&
                (runtimeSnapshot.lastCrossedSectorSeq ?? 0) + 1 === index + 1;

              return (
              <View
                key={`sector-${index + 1}`}
                className={`flex-1 rounded-2xl p-3 border ${
                  isActive ? 'bg-red-500/10 border-red-400/30' : 'bg-zinc-100 dark:bg-white/5 border-zinc-200 dark:border-white/10'
                }`}
              >
                <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{`S${index + 1}`}</Text>
                <Text className="text-lg font-medium text-zinc-900 dark:text-white">
                  {isActive
                    ? formatSectorTime(currentSectorElapsedMs)
                    : formatSectorTime(runtimeSnapshot?.currentLapSectorSplitsMs[index] ?? null)}
                </Text>
              </View>
              );
            })}
          </View>
        </View>

        {/* Pit In + End buttons */}
        <View className="flex-row gap-3 mt-4">
          <Pressable className="flex-1 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 py-3.5 items-center">
            <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('session.markPitIn')}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void handleEndSession();
            }}
            className="flex-1 rounded-2xl bg-red-500 py-3.5 items-center"
          >
            <Text className="text-sm font-semibold text-white">{i18n.t('session.end')}</Text>
          </Pressable>
        </View>
      </LinearGradient>

      {/* Scrollable content below */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 py-4 gap-4">
          {/* Stats row */}
          <View className="flex-row gap-3">
            {[
              [i18n.t('session.bestLap'), formatLapTime(runtimeSnapshot?.bestLapMs ?? null)],
              [i18n.t('session.topSpeed'), formatSpeed(runtimeSnapshot?.maxSpeedKph ?? null)],
              [i18n.t('session.duration'), formatDuration(runtimeSnapshot?.latestAcceptedSample?.elapsedMs ?? null)],
            ].map(([l, v]) => (
              <View key={l} className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{l}</Text>
                <Text className="text-lg font-semibold text-zinc-900 dark:text-white">{v}</Text>
              </View>
            ))}
          </View>

          {/* Live Telemetry */}
          <Card>
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('telemetry.title')}</Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('telemetry.subtitle')}</Text>
              </View>
              <Text className="text-sm text-emerald-400">
                {runtimeSnapshot?.latestAcceptedSample ? i18n.t('telemetry.stable') : i18n.t('common.tbd')}
              </Text>
            </View>
            <View className="gap-3">
              <ProgressBar
                label={i18n.t('telemetry.throttle')}
                value={`${Math.min(100, Math.round(currentSpeedKph ?? 0))}%`}
              />
              <ProgressBar
                label={i18n.t('telemetry.brake')}
                value={`${brakePercent}%`}
              />
              <ProgressBar
                label={i18n.t('telemetry.gpsSignal')}
                value={getGpsSignalLabel(runtimeSnapshot?.latestAcceptedSample?.accuracyM ?? null)}
                color="bg-emerald-400"
              />
            </View>
          </Card>

          {/* Recent Laps */}
          <Card>
            <Text className="text-sm font-medium text-zinc-900 dark:text-white mb-3">{i18n.t('recording.lapTimes')}</Text>
            {recentLaps.length > 0 ? (
              <View className="gap-2">
                {recentLaps.map((item) => (
                  <LapRow key={item.lap} item={item} />
                ))}
              </View>
            ) : (
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.noLapDataYet')}</Text>
            )}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
