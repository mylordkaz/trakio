import { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSharedValue } from 'react-native-reanimated';
import { useT, type TranslateFn } from '@/hooks/useT';
import ProLimitModal from '@/components/ProLimitModal';
import { createSessionRecorder, getOrCreateDefaultUserProfile, getTrackById } from '@/db';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';
import { requestForegroundLocationPermission } from '@/telemetry/location';
import { createConnectionLifecycle } from '@/telemetry/sources/connection-lifecycle';
import { createImuCapture } from '@/telemetry/imu-capture';
import { createLiveReference, deriveSectorCards, deriveSectorStatuses, type LiveDeltaState } from '@/telemetry/live-reference';
import { createCarFrameG, type CarFrameG } from '@/telemetry/car-frame-g';
import LandscapeDashboard from '@/components/recording/landscape/LandscapeDashboard';
import PortraitDashboard from '@/components/recording/portrait/PortraitDashboard';
import { IMU_CAPTURE_ENABLED } from '@/constants/featureFlags';
import { useExternalGps } from '@/contexts/ExternalGpsContext';
import { useEntitlements } from '@/contexts/EntitlementContext';
import { isSessionQuotaExempt } from '@/services/entitlements';
import { createSessionRuntime } from '@/telemetry/session-runtime';
import type { TrackDetail } from '@/db';
import type { TelemetrySample, ExtendedTelemetrySample } from '@/telemetry/types';
import type { ActiveSourceInfo } from '@/telemetry/sources/types';
import { formatDurationMs as formatDuration } from '@/utils/format';
import {
  FREE_SESSION_LIMIT,
  getSessionQuota,
  type SessionQuota,
} from '@/services/session-quota';
import { useMenu } from '@/contexts/MenuContext';
import { getTrackDisplayTitle, localizeTrack } from '@/utils/track-localization';

function getGpsAccuracyLabel(accuracyM: number | null, t: TranslateFn) {
  if (accuracyM === null) {
    return t('telemetry.searching');
  }

  return t('telemetry.gpsAccuracy', { meters: Math.round(accuracyM) });
}

// Accepted samples stop arriving when the app is backgrounded, the GPS signal
// drops, or every fix is being rejected; the driver needs to know live.
const GPS_STALE_THRESHOLD_MS = 4000;
const GPS_DEGRADED_REJECTION_STREAK = 5;

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

const TELEMETRY_DISPLAY_REFRESH_MS = 100;
const EMPTY_LIVE_DELTA: LiveDeltaState = {
  deltaMs: null,
  stale: false,
  referenceLapNumber: null,
  referenceLapTimeMs: null,
  referenceSectorSplitsMs: [],
};
const EMPTY_G: CarFrameG = { longitudinalG: 0, lateralG: 0, magnitudeG: 0, aligned: false };
const DEVICE_G_STALE_MS = 1000;

export default function RecordingScreen() {
  const t = useT();
  useKeepAwake();
  const router = useRouter();
  const db = useSQLiteContext();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const params = useLocalSearchParams<{ trackId?: string; sessionName?: string; condition?: string; temperatureC?: string }>();
  const gradientColors = useHeaderGradient('red');
  const { selectedDevice } = useExternalGps();
  const { locale } = useMenu();
  const { accessStatus } = useEntitlements();
  const quotaExemptRef = useRef(isSessionQuotaExempt(accessStatus));
  quotaExemptRef.current = isSessionQuotaExempt(accessStatus);
  const selectedDeviceRef = useRef(selectedDevice);
  selectedDeviceRef.current = selectedDevice;
  const [activeSourceInfo, setActiveSourceInfo] = useState<ActiveSourceInfo | null>(null);
  const [track, setTrack] = useState<TrackDetail | null>(null);
  const displayTrack = track ? localizeTrack(track, locale) : null;
  const [isLoadingTrack, setIsLoadingTrack] = useState(true);
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
  // The key is stored, not the message: a translated string held in
  // state would not follow a language change, and making the effect
  // that sets it depend on the translator would re-run a data load.
  const loadError = loadErrorKey ? t(loadErrorKey) : null;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [brakePercent, setBrakePercent] = useState(0);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ReturnType<ReturnType<typeof createSessionRuntime>['getSnapshot']> | null>(null);
  const runtimeRef = useRef<ReturnType<typeof createSessionRuntime> | null>(null);
  const lifecycleRef = useRef<ReturnType<typeof createConnectionLifecycle> | null>(null);
  const imuCaptureRef = useRef<ReturnType<typeof createImuCapture> | null>(null);
  // Live reference and G state live here, not in the dashboard, so rotating
  // to portrait keeps the reference lap and the learned mount yaw.
  const liveReferenceRef = useRef<ReturnType<typeof createLiveReference> | null>(null);
  const liveDeltaRef = useRef<LiveDeltaState>(EMPTY_LIVE_DELTA);
  const [liveDelta, setLiveDelta] = useState<LiveDeltaState>(EMPTY_LIVE_DELTA);
  const carFrameGRef = useRef<ReturnType<typeof createCarFrameG> | null>(null);
  const deviceGRef = useRef<ReturnType<typeof createCarFrameG> | null>(null);
  const lastDeviceGAtMsRef = useRef(0);
  const [gReading, setGReading] = useState<CarFrameG>(EMPTY_G);
  const lastGReadingMsRef = useRef(0);
  const publishGRef = useRef<((reading: CarFrameG) => void) | null>(null);
  const lateralSv = useSharedValue(0);
  const longitudinalSv = useSharedValue(0);
  const hasStoppedRef = useRef(false);
  const previousAcceptedSampleRef = useRef<TelemetrySample | null>(null);
  const lastRenderMsRef = useRef(0);
  const lastRenderedStatusRef = useRef<string | null>(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [wasInterrupted, setWasInterrupted] = useState(false);
  const [limitQuota, setLimitQuota] = useState<SessionQuota | null>(null);
  const tabNavigator = useNavigation().getParent();

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' && !hasStoppedRef.current) {
        setWasInterrupted(true);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    void ScreenOrientation.unlockAsync();
    void ScreenOrientation.getOrientationAsync()
      .then((orientation) => {
        if (isMounted) {
          setIsLandscape(
            orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
            orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
          );
        }
      })
      .catch(() => undefined);

    const subscription = ScreenOrientation.addOrientationChangeListener((event) => {
      const orientation = event.orientationInfo.orientation;
      setIsLandscape(
        orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
      );
    });

    return () => {
      isMounted = false;
      ScreenOrientation.removeOrientationChangeListener(subscription);
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  useEffect(() => {
    if (pendingSessionId !== null && !isLandscape) {
      router.replace({
        pathname: '/(tabs)/record/post-session',
        params: { id: pendingSessionId },
      });
    }
  }, [pendingSessionId, isLandscape, router]);

  useEffect(() => {
    const defaultTabBarStyle = {
      backgroundColor: isDark ? '#18181b' : '#ffffff',
      borderTopColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
    };

    tabNavigator?.setOptions({
      tabBarStyle: isLandscape ? { display: 'none' as const } : defaultTabBarStyle,
    });

    return () => {
      tabNavigator?.setOptions({ tabBarStyle: defaultTabBarStyle });
    };
  }, [isLandscape, isDark, tabNavigator]);

  useEffect(() => {
    let isMounted = true;

    async function loadTrack() {
      if (!params.trackId) {
        if (isMounted) {
          setLoadErrorKey('circuits.unableToLoadTrack');
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
          setLoadErrorKey('circuits.unableToLoadTrack');
          setTrack(null);
          return;
        }

        setTrack(nextTrack);
        setLoadErrorKey(null);
      } catch {
        if (!isMounted) {
          return;
        }

        setLoadErrorKey('circuits.unableToLoadTrack');
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
        setLoadErrorKey('recording.locationPermissionRequired');
        return;
      }

      const user = await getOrCreateDefaultUserProfile(db);
      const recorder = createSessionRecorder(db);
      const runtime = createSessionRuntime({
        track,
        timingLines: track.timingLines,
        recorder,
        config: {
          sessionName: params.sessionName ?? null,
          car: user.car ?? null,
          condition: params.condition && params.condition !== 'unknown' ? params.condition : null,
          temperatureC: (() => { const t = parseFloat(params.temperatureC ?? ''); return Number.isFinite(t) ? t : null; })(),
        },
      });

      try {
        const quota = await getSessionQuota(db, quotaExemptRef.current);
        if (!quota.canRecord) {
          setLimitQuota(quota);
          return;
        }
      } catch {
        // A failed local count must not make GPS recording depend on connectivity.
      }

      runtimeRef.current = runtime;

      const startedSnapshot = await runtime.start();
      if (!isMounted) {
        return;
      }

      setRuntimeSnapshot(startedSnapshot);

      liveReferenceRef.current = createLiveReference({
        sectorLineCount: track.sectorCount > 0 ? track.sectorCount - 1 : 0,
      });
      liveDeltaRef.current = EMPTY_LIVE_DELTA;
      setLiveDelta(EMPTY_LIVE_DELTA);
      const carFrameG = createCarFrameG();
      carFrameGRef.current = carFrameG;
      // RaceBox and Qstarz deliver their own accelerometer with every fix;
      // their axis conventions are not documented well enough to assume.
      deviceGRef.current = createCarFrameG({ handedness: 'unknown' });
      lastDeviceGAtMsRef.current = 0;
      setGReading(EMPTY_G);

      const publishG = (reading: CarFrameG) => {
        lateralSv.value = reading.lateralG;
        longitudinalSv.value = reading.longitudinalG;
        const now = Date.now();
        if (isMounted && now - lastGReadingMsRef.current >= TELEMETRY_DISPLAY_REFRESH_MS) {
          lastGReadingMsRef.current = now;
          setGReading(reading);
        }
      };
      publishGRef.current = publishG;

      if (IMU_CAPTURE_ENABLED && startedSnapshot.sessionId) {
        const imuCapture = createImuCapture(db, startedSnapshot.sessionId, (measurement, recordedAt) => {
          const reading = carFrameG.ingest(
            measurement.acceleration ?? null,
            measurement.accelerationIncludingGravity ?? null,
            recordedAt
          );
          // A connected device's G takes over the meter while it is flowing.
          if (Date.now() - lastDeviceGAtMsRef.current > DEVICE_G_STALE_MS) {
            publishG(reading);
          }
        });
        imuCaptureRef.current = imuCapture;
        // Best-effort: capture never blocks or fails the recording flow.
        void imuCapture.start();
      }

      const lifecycle = createConnectionLifecycle({
        onResetContinuity: () => runtimeRef.current?.resetContinuity(),
      });
      lifecycleRef.current = lifecycle;

      await lifecycle.start(
        {
        onSample: (sample) => {
          const activeRuntime = runtimeRef.current;

          if (!activeRuntime || !isMounted) {
            return;
          }

          void activeRuntime.handleSample(sample).then((result) => {
            if (!isMounted) {
              return;
            }

            // Display-only consumers see every accepted sample; they run after
            // the runtime has returned and never feed back into timing.
            const acceptedSample = result.snapshot.latestAcceptedSample;
            if (result.accepted && acceptedSample) {
              carFrameGRef.current?.observeGps(acceptedSample);
              const deviceSample = acceptedSample as ExtendedTelemetrySample;
              const deviceG = deviceGRef.current;
              if (
                deviceG &&
                deviceSample.source !== 'gps' &&
                typeof deviceSample.gForceX === 'number' &&
                typeof deviceSample.gForceY === 'number' &&
                typeof deviceSample.gForceZ === 'number'
              ) {
                deviceG.observeGps(deviceSample);
                const reading = deviceG.ingestDevice(
                  { x: deviceSample.gForceX, y: deviceSample.gForceY, z: deviceSample.gForceZ },
                  deviceSample.recordedAt
                );
                lastDeviceGAtMsRef.current = Date.now();
                publishGRef.current?.(reading);
              }
              const liveReference = liveReferenceRef.current;
              if (liveReference) {
                liveDeltaRef.current = liveReference.onAccepted({
                  sample: acceptedSample,
                  events: result.events,
                  completedLaps: result.snapshot.completedLaps,
                });
              }
            }

            // The runtime persists every sample; only the on-screen snapshot is
            // coalesced. Flush immediately on a lap/sector/status change,
            // otherwise cap the refresh so 25 Hz doesn't drive 25 renders/sec.
            const now = Date.now();
            const isStructural =
              (result.accepted && result.events.length > 0) ||
              result.snapshot.status !== lastRenderedStatusRef.current;

            if (isStructural || now - lastRenderMsRef.current >= TELEMETRY_DISPLAY_REFRESH_MS) {
              lastRenderMsRef.current = now;
              lastRenderedStatusRef.current = result.snapshot.status;
              setRuntimeSnapshot(result.snapshot);
              setLiveDelta(liveDeltaRef.current);
            }
          }).catch(() => {
            if (!isMounted) {
              return;
            }

            setLoadErrorKey('recording.telemetryProcessingFailed');
          });
        },
        onError: () => {
          if (!isMounted) {
            return;
          }

          setLoadErrorKey('recording.locationSubscriptionError');
        },
        onActiveSourceChange: (source) => {
          if (!isMounted) return;
          setActiveSourceInfo(source);
        },
        onExternalDeviceStateChange: (state) => {
          if (!isMounted || !selectedDeviceRef.current) return;
          if (state === 'connected') {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } else if (state === 'disconnected') {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } else if (state === 'reconnecting') {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
        },
        },
        selectedDeviceRef.current ?? undefined
      );
    }

    void startRecordingSession();

    return () => {
      isMounted = false;
      void lifecycleRef.current?.stop();
      lifecycleRef.current = null;
      void imuCaptureRef.current?.stop().catch(() => undefined);
      imuCaptureRef.current = null;

      const activeRuntime = runtimeRef.current;
      if (activeRuntime && !hasStoppedRef.current) {
        void activeRuntime.stop().catch(() => undefined);
      }
    };
  }, [db, params.sessionName, params.condition, params.temperatureC, router, track, lateralSv, longitudinalSv]);

  useEffect(() => {
    const sessionStartedAtMs = runtimeSnapshot?.sessionStartedAtMs;

    if (!sessionStartedAtMs || runtimeSnapshot?.sessionEndedAtMs !== null) {
      return;
    }

    // Landscape has its own lap clock; the screen only needs the tick for
    // GPS staleness there.
    const intervalId = setInterval(() => {
      setNowMs(Date.now());
    }, isLandscape ? 1000 : 50);

    return () => {
      clearInterval(intervalId);
    };
  }, [isLandscape, runtimeSnapshot?.sessionEndedAtMs, runtimeSnapshot?.sessionStartedAtMs]);

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
  const sectorStatuses = deriveSectorStatuses({
    sectorCount,
    isLapInProgress: runtimeSnapshot?.status === 'lap_in_progress',
    lastCrossedSectorSeq: runtimeSnapshot?.lastCrossedSectorSeq ?? null,
    currentLapSectorSplitsMs: runtimeSnapshot?.currentLapSectorSplitsMs ?? {},
    referenceSectorSplitsMs: liveDelta.referenceSectorSplitsMs,
  });
  const sessionDurationMs =
    runtimeSnapshot?.sessionStartedAtMs !== null && runtimeSnapshot?.sessionStartedAtMs !== undefined
      ? (runtimeSnapshot.sessionEndedAtMs ?? nowMs) - runtimeSnapshot.sessionStartedAtMs
      : null;
  const currentLapLabel =
    runtimeSnapshot?.status === 'lap_in_progress'
      ? runtimeSnapshot.currentLapNumber
      : runtimeSnapshot?.status === 'armed'
        // Armed means waiting for the next run to open, which is lap 1 at the
        // start of a session and the following number after a finish.
        ? runtimeSnapshot.currentLapNumber + 1
        : 0;
  const currentSectorElapsedMs =
    runtimeSnapshot?.status === 'lap_in_progress' &&
    runtimeSnapshot.currentSectorStartedWallClockMs !== null
      ? Math.max(0, nowMs - runtimeSnapshot.currentSectorStartedWallClockMs)
      : null;
  // Until the lifecycle reports, the intended device is shown while it
  // connects; afterwards the active source is the truth — a fallback to phone
  // GPS must not keep displaying the device name.
  const externalSourceName = activeSourceInfo
    ? activeSourceInfo.sourceType === 'gps'
      ? null
      : activeSourceInfo.deviceName
    : (selectedDeviceRef.current?.name ?? null);

  const isActivelyRecording =
    runtimeSnapshot !== null &&
    runtimeSnapshot.sessionStartedAtMs !== null &&
    runtimeSnapshot.sessionEndedAtMs === null;
  const latestSample = runtimeSnapshot?.latestAcceptedSample ?? null;
  const isGpsLost =
    isActivelyRecording &&
    latestSample !== null &&
    nowMs - latestSample.recordedAt > GPS_STALE_THRESHOLD_MS;
  const isGpsDegraded =
    isActivelyRecording &&
    !isGpsLost &&
    (runtimeSnapshot?.consecutiveRejectedCount ?? 0) >= GPS_DEGRADED_REJECTION_STREAK;
  const warningMessage = isGpsLost
    ? t('recording.gpsSignalLost')
    : isGpsDegraded
      ? t('recording.gpsDegraded')
      : wasInterrupted
        ? t('recording.recordingInterrupted')
        : null;
  const gpsAccuracy: { label: string; state: 'good' | 'degraded' | 'lost' | 'none' } = isGpsLost
    ? { label: t('telemetry.gpsLost'), state: 'lost' }
    : isGpsDegraded
      ? { label: t('telemetry.gpsDegradedShort'), state: 'degraded' }
      : latestSample
        ? { label: getGpsAccuracyLabel(latestSample.accuracyM, t), state: 'good' }
        : { label: t('telemetry.searching'), state: 'none' };
  const currentSpeedKph =
    latestSample?.speedMps !== null && latestSample?.speedMps !== undefined
      ? latestSample.speedMps * 3.6
      : null;

  const deltaDimmed = isGpsLost || liveDelta.stale || (runtimeSnapshot?.pitInMarked ?? false);
  const sectorCards = deriveSectorCards({
    statuses: sectorStatuses,
    currentLapSectorSplitsMs: runtimeSnapshot?.currentLapSectorSplitsMs ?? {},
    referenceSectorSplitsMs: liveDelta.referenceSectorSplitsMs,
    activeSectorElapsedMs: currentSectorElapsedMs,
    liveDeltaMs: liveDelta.deltaMs,
  });

  function handlePitIn() {
    void runtimeRef.current?.markPitIn().then((snapshot) => {
      setRuntimeSnapshot(snapshot);
    }).catch(() => undefined);
  }

  async function handleEndSession() {
    if (isEndingSession) return;
    setIsEndingSession(true);

    try {
      // Stop telemetry
      const activeRuntime = runtimeRef.current;
      void lifecycleRef.current?.stop();
      lifecycleRef.current = null;
      void imuCaptureRef.current?.stop().catch(() => undefined);
      imuCaptureRef.current = null;

      let sessionId = '';
      if (activeRuntime && !hasStoppedRef.current) {
        hasStoppedRef.current = true;
        const snapshot = await activeRuntime.stop();
        setRuntimeSnapshot(snapshot);
        sessionId = snapshot.sessionId ?? '';
      }

      // Lock portrait — navigation fires reactively via useEffect when portrait is confirmed
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      setPendingSessionId(sessionId);
    } catch {
      // Avoid stranding on dark curtain — navigate directly as fallback
      router.replace('/(tabs)/record/post-session');
    }
  }

  if (isEndingSession) {
    return <View className="flex-1 bg-zinc-950" />;
  }

  return (
    <View className="flex-1 bg-zinc-950">
    {isLandscape ? (
      <LandscapeDashboard
        lapLabel={currentLapLabel}
        bestLapMs={runtimeSnapshot?.bestLapMs ?? null}
        lastLapMs={runtimeSnapshot?.lastLapMs ?? null}
        lapStartedWallClockMs={
          runtimeSnapshot?.status === 'lap_in_progress' ? runtimeSnapshot.currentLapStartedWallClockMs : null
        }
        sectorStatuses={sectorStatuses}
        liveDelta={liveDelta}
        deltaDimmed={deltaDimmed}
        gReading={gReading}
        lateralSv={lateralSv}
        longitudinalSv={longitudinalSv}
        pitInMarked={runtimeSnapshot?.pitInMarked ?? false}
        warning={warningMessage ? { message: warningMessage, severe: isGpsLost } : null}
        onPitIn={handlePitIn}
        onEnd={() => {
          void handleEndSession();
        }}
      />
    ) : (
      <PortraitDashboard
        tone={isDark ? 'dark' : 'light'}
        gradientColors={gradientColors}
        trackTitle={track ? getTrackDisplayTitle(track, locale) : t('circuits.loadingTrack')}
        sessionName={params.sessionName ?? displayTrack?.layoutName ?? t('recording.sessionRecording')}
        durationLabel={formatDuration(sessionDurationMs)}
        banner={
          loadError
            ? { message: loadError, tone: 'red' }
            : warningMessage
              ? { message: warningMessage, tone: isGpsLost ? 'red' : 'amber' }
              : isLoadingTrack
                ? { message: t('circuits.loadingTrack'), tone: 'neutral' }
                : null
        }
        lapLabel={currentLapLabel}
        bestLapMs={runtimeSnapshot?.bestLapMs ?? null}
        lastLapMs={runtimeSnapshot?.lastLapMs ?? null}
        lapStartedWallClockMs={
          runtimeSnapshot?.status === 'lap_in_progress' ? runtimeSnapshot.currentLapStartedWallClockMs : null
        }
        liveDelta={liveDelta}
        deltaDimmed={deltaDimmed}
        sectorCards={sectorCards}
        gReading={gReading}
        lateralSv={lateralSv}
        longitudinalSv={longitudinalSv}
        sourceLabel={externalSourceName ?? 'GPS'}
        accuracy={gpsAccuracy}
        speedKph={currentSpeedKph}
        brakePercent={brakePercent}
        pitInMarked={runtimeSnapshot?.pitInMarked ?? false}
        onPitIn={handlePitIn}
        onEnd={() => {
          void handleEndSession();
        }}
      />
    )}
      <ProLimitModal
        visible={limitQuota !== null}
        used={limitQuota?.used ?? 0}
        limit={limitQuota?.limit ?? FREE_SESSION_LIMIT}
        onClose={() => {
          setLimitQuota(null);
          router.back();
        }}
        onManageSessions={() => {
          setLimitQuota(null);
          router.replace('/(tabs)/sessions');
        }}
        onViewPro={() => {
          setLimitQuota(null);
          router.replace('/pro');
        }}
      />
    </View>
  );
}
