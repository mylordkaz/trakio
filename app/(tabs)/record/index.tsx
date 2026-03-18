import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Battery from 'expo-battery';
import i18n from '@/i18n';
import Card from '@/components/Card';
import type { TrackListItem } from '@/db';
import { getNextSessionNumber, getTrackById, getTrackSessionSummary, listTracks } from '@/db';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';
import {
  getCurrentLocationSample,
  getForegroundLocationPermissionState,
  requestForegroundLocationPermission,
} from '@/telemetry/location';

type ChecklistItemKey = 'gpsLock' | 'battery' | 'startFinishLineSet';

type ChecklistStatus = 'ready' | 'warning' | 'error';

type ChecklistItem = {
  key: ChecklistItemKey;
  value: string;
  status: ChecklistStatus;
};

function getChecklistValueClass(status: ChecklistStatus) {
  switch (status) {
    case 'ready':
      return 'text-emerald-400';
    case 'warning':
      return 'text-amber-400';
    case 'error':
      return 'text-red-400';
  }
}

export default function PreSessionScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [circuits, setCircuits] = useState<TrackListItem[]>([]);
  const [selectedCircuit, setSelectedCircuit] = useState<TrackListItem | null>(null);
  const [showCircuitPicker, setShowCircuitPicker] = useState(false);
  const [isLoadingCircuits, setIsLoadingCircuits] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [trackSummary, setTrackSummary] = useState<{ lastVisit: string | null; bestLapMs: number | null }>({
    lastVisit: null,
    bestLapMs: null,
  });
  const [sessionNumber, setSessionNumber] = useState(1);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([
    { key: 'gpsLock', value: i18n.t('telemetry.searching'), status: 'warning' },
    { key: 'battery', value: i18n.t('common.tbd'), status: 'warning' },
    { key: 'startFinishLineSet', value: i18n.t('common.tbd'), status: 'warning' },
  ]);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const gradientColors = useHeaderGradient('emerald');
  const sessionTitle = i18n.t('preSession.sessionTitle', { number: sessionNumber });

  useEffect(() => {
    let isMounted = true;

    async function loadCircuits() {
      try {
        setIsLoadingCircuits(true);
        const nextCircuits = await listTracks(db);

        if (!isMounted) {
          return;
        }

        setCircuits(nextCircuits);
        setSelectedCircuit((currentCircuit) => {
          if (currentCircuit) {
            return nextCircuits.find((circuit) => circuit.id === currentCircuit.id) ?? nextCircuits[0] ?? null;
          }

          return nextCircuits[0] ?? null;
        });
        setLoadError(null);
      } catch {
        if (!isMounted) {
          return;
        }

        setLoadError(i18n.t('circuits.loadError'));
      } finally {
        if (isMounted) {
          setIsLoadingCircuits(false);
        }
      }
    }

    void loadCircuits();

    return () => {
      isMounted = false;
    };
  }, [db]);

  useEffect(() => {
    let isMounted = true;

    async function loadTrackSummary() {
      if (!selectedCircuit) {
        if (isMounted) {
          setTrackSummary({ lastVisit: null, bestLapMs: null });
        }
        return;
      }

      try {
        const summary = await getTrackSessionSummary(db, selectedCircuit.id);

        if (!isMounted) {
          return;
        }

        setTrackSummary(summary);
      } catch {
        if (!isMounted) {
          return;
        }

        setTrackSummary({ lastVisit: null, bestLapMs: null });
      }
    }

    void loadTrackSummary();

    return () => {
      isMounted = false;
    };
  }, [db, selectedCircuit]);

  useEffect(() => {
    let isMounted = true;

    async function loadChecklist() {
      let gpsItem: ChecklistItem = {
        key: 'gpsLock',
        value: i18n.t('telemetry.searching'),
        status: 'warning',
      };
      let batteryItem: ChecklistItem = {
        key: 'battery',
        value: i18n.t('common.tbd'),
        status: 'warning',
      };
      let startFinishItem: ChecklistItem = {
        key: 'startFinishLineSet',
        value: i18n.t('common.tbd'),
        status: 'warning',
      };

      try {
        let permissionState = await getForegroundLocationPermissionState();

        if (permissionState === 'undetermined') {
          permissionState = await requestForegroundLocationPermission();
        }

        if (permissionState === 'denied') {
          gpsItem = {
            key: 'gpsLock',
            value: i18n.t('telemetry.blocked'),
            status: 'error',
          };
        } else if (permissionState === 'granted') {
          const locationSample = await getCurrentLocationSample();
          const accuracyM = locationSample?.accuracyM ?? null;

          if (accuracyM === null) {
            gpsItem = {
              key: 'gpsLock',
              value: i18n.t('telemetry.searching'),
              status: 'warning',
            };
          } else if (accuracyM <= 10) {
            gpsItem = {
              key: 'gpsLock',
              value: i18n.t('telemetry.strong'),
              status: 'ready',
            };
          } else {
            gpsItem = {
              key: 'gpsLock',
              value: i18n.t('telemetry.weak'),
              status: 'warning',
            };
          }
        }
      } catch {
        gpsItem = {
          key: 'gpsLock',
          value: i18n.t('telemetry.searching'),
          status: 'warning',
        };
      }

      try {
        const batteryLevel = await Battery.getBatteryLevelAsync();

        batteryItem = {
          key: 'battery',
          value: `${Math.round(batteryLevel * 100)}%`,
          status: 'ready',
        };
      } catch {
        batteryItem = {
          key: 'battery',
          value: i18n.t('common.tbd'),
          status: 'warning',
        };
      }

      if (selectedCircuit) {
        try {
          const trackDetail = await getTrackById(db, selectedCircuit.id);
          const hasStartFinishLine = !!trackDetail?.timingLines.some((timingLine) => timingLine.type === 'start_finish');

          startFinishItem = {
            key: 'startFinishLineSet',
            value: hasStartFinishLine ? i18n.t('common.ok') : i18n.t('common.tbd'),
            status: hasStartFinishLine ? 'ready' : 'error',
          };
        } catch {
          startFinishItem = {
            key: 'startFinishLineSet',
            value: i18n.t('common.tbd'),
            status: 'error',
          };
        }
      }

      if (!isMounted) {
        return;
      }

      setChecklistItems([gpsItem, batteryItem, startFinishItem]);
    }

    void loadChecklist();

    return () => {
      isMounted = false;
    };
  }, [db, selectedCircuit]);

  useEffect(() => {
    let isMounted = true;

    async function loadSessionNumber() {
      if (!selectedCircuit) {
        if (isMounted) {
          setSessionNumber(1);
        }
        return;
      }

      try {
        const nextSessionNumber = await getNextSessionNumber(db);

        if (!isMounted) {
          return;
        }

        setSessionNumber(nextSessionNumber);
      } catch {
        if (!isMounted) {
          return;
        }

        setSessionNumber(1);
      }
    }

    void loadSessionNumber();

    return () => {
      isMounted = false;
    };
  }, [db, selectedCircuit]);

  function formatTrackLength(lengthMeters: number | null) {
    if (lengthMeters === null) {
      return i18n.t('common.tbd');
    }

    return `${(lengthMeters / 1000).toFixed(3)} km`;
  }

  function formatLastVisit(value: string | null) {
    if (!value) {
      return i18n.t('common.tbd');
    }

    return new Date(value).toLocaleDateString(i18n.locale === 'ja' ? 'ja-JP' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function formatLapTime(lapTimeMs: number | null) {
    if (lapTimeMs === null) {
      return '--:--.---';
    }

    const totalSeconds = lapTimeMs / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - minutes * 60;

    return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
  }

  const readyChecklistCount = checklistItems.filter((item) => item.status === 'ready').length;

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
          {/* Header */}
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('preSession.title')}</Text>
            <View className="flex-row items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 border border-emerald-400/20">
              <View className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <Text className="text-sm text-emerald-400">{i18n.t('session.ready')}</Text>
            </View>
          </View>

          {/* Title + READY badge */}
          <View className="mb-4">
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('preSession.readyToRecord')}</Text>
            <Text className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">{sessionTitle}</Text>
          </View>

          {/* Track Selection */}
          <View className="rounded-3xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10 p-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('preSession.selectedCircuit')}</Text>
              <Pressable onPress={() => setShowCircuitPicker(!showCircuitPicker)}>
                <Text className="text-sm font-medium text-emerald-400">
                  {showCircuitPicker ? i18n.t('common.done') : i18n.t('common.change')}
                </Text>
              </Pressable>
            </View>

            {isLoadingCircuits ? (
              <View className="rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 py-3">
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('circuits.loadingTracks')}</Text>
              </View>
            ) : loadError ? (
              <View className="rounded-2xl bg-red-500/10 border border-red-500/20 px-3 py-3">
                <Text className="text-sm text-red-700 dark:text-red-200">{loadError}</Text>
              </View>
            ) : !selectedCircuit ? (
              <View className="rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 py-3">
                <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('circuits.noTracksFound')}</Text>
                <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {i18n.t('circuits.noTracksFoundHint')}
                </Text>
              </View>
            ) : !showCircuitPicker ? (
              <Pressable onPress={() => setShowCircuitPicker(true)}>
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">{selectedCircuit.name}</Text>
                    <Text className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {[selectedCircuit.country, formatTrackLength(selectedCircuit.lengthMeters), i18n.t('preSession.cornersCount', { count: selectedCircuit.corners ?? 0 })]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#71717a" />
                </View>
                <View className="flex-row gap-2 mt-3">
                  <View className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 py-2">
                    <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-0.5">{i18n.t('preSession.lastVisit')}</Text>
                    <Text className="text-sm font-medium text-zinc-900 dark:text-white">{formatLastVisit(trackSummary.lastVisit)}</Text>
                  </View>
                  <View className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 py-2">
                    <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-0.5">{i18n.t('session.bestLap')}</Text>
                    <Text className="text-sm font-medium text-zinc-900 dark:text-white">{formatLapTime(trackSummary.bestLapMs)}</Text>
                  </View>
                </View>
              </Pressable>
            ) : (
              <View className="gap-2">
                {circuits.map((circuit) => (
                  <Pressable
                    key={circuit.id}
                    onPress={() => { setSelectedCircuit(circuit); setShowCircuitPicker(false); }}
                    className={`flex-row items-center justify-between rounded-2xl px-3 py-2.5 border ${
                      selectedCircuit.id === circuit.id
                        ? 'bg-emerald-500/10 border-emerald-400/30'
                        : 'bg-zinc-100 dark:bg-white/5 border-zinc-200 dark:border-white/10'
                    }`}
                  >
                    <View>
                      <Text className="text-sm font-medium text-zinc-900 dark:text-white">{circuit.name}</Text>
                      <Text className="text-xs text-zinc-400 dark:text-zinc-500">
                        {formatTrackLength(circuit.lengthMeters)} · {i18n.t('preSession.cornersCount', { count: circuit.corners ?? 0 })}
                      </Text>
                    </View>
                    {selectedCircuit.id === circuit.id && (
                      <Ionicons name="checkmark" size={16} color="#34d399" />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Start button */}
          <View className="mt-4">
            <Pressable
              onPress={() => {
                if (!selectedCircuit) {
                  return;
                }

                router.push({
                  pathname: '/(tabs)/record/recording',
                  params: { trackId: selectedCircuit.id, sessionName: sessionTitle },
                });
              }}
              className="w-full rounded-2xl bg-emerald-500 py-4 items-center"
            >
              <Text className="text-sm font-semibold text-black">
                {i18n.t('session.start')}
              </Text>
            </Pressable>
          </View>
        </LinearGradient>

        <View className="px-5 py-4 gap-4">
          {/* Conditions */}
          <View className="flex-row gap-3">
            <View className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3">
              <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{i18n.t('preSession.condition')}</Text>
              <Text className="text-2xl mb-1">☀️</Text>
              <Text className="text-sm font-semibold text-zinc-900 dark:text-white">{i18n.t('preSession.clear')}</Text>
            </View>
            <View className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3">
              <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{i18n.t('preSession.airTemp')}</Text>
              <Text className="text-lg font-semibold text-zinc-900 dark:text-white">24°C</Text>
            </View>
            <View className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3">
              <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{i18n.t('preSession.wind')}</Text>
              <Text className="text-lg font-semibold text-zinc-900 dark:text-white">14 km/h</Text>
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">NW</Text>
            </View>
          </View>

          {/* Session Checklist */}
          <Card>
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('preSession.sessionChecklist')}</Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('preSession.checklistSubtitle')}</Text>
              </View>
              <Text className="text-sm text-emerald-400">{i18n.t('preSession.allReady', { count: readyChecklistCount, total: checklistItems.length })}</Text>
            </View>
            <View className="gap-2">
              {checklistItems.map((item) => (
                <View key={item.key} className="flex-row items-center justify-between rounded-2xl bg-zinc-50 dark:bg-black/20 px-3 py-2.5 border border-zinc-100 dark:border-white/5">
                  <Text className="text-sm text-zinc-900 dark:text-white">{i18n.t(`preSession.${item.key}`)}</Text>
                  <Text className={`text-sm font-medium ${getChecklistValueClass(item.status)}`}>{item.value}</Text>
                </View>
              ))}
            </View>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
