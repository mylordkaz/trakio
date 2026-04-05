import { useMemo, useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Battery from 'expo-battery';
import i18n from '@/i18n';
import Card from '@/components/Card';
import EditableSessionTitle from '@/components/EditableSessionTitle';
import type { TrackListItem } from '@/db';
import { getNextSessionNumber, getOrCreateDefaultUserProfile, getTrackById, getTrackSessionSummary, listTracks } from '@/db';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';
import { useMenu } from '@/contexts/MenuContext';
import { fetchTrackWeather, type TrackWeather } from '@/services/weather';
import {
  getCurrentLocationSample,
  getForegroundLocationPermissionState,
  requestForegroundLocationPermission,
} from '@/telemetry/location';
import { formatLapTime } from '@/utils/format';

type ChecklistItemKey = 'gpsLock' | 'battery' | 'startFinishLineSet';

type ChecklistStatus = 'ready' | 'warning' | 'error';

type ChecklistItem = {
  key: ChecklistItemKey;
  value: string;
  status: ChecklistStatus;
};

const AUTO_SELECT_MAX_DISTANCE_M = 2000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getDistanceMeters(
  aLatitude: number,
  aLongitude: number,
  bLatitude: number,
  bLongitude: number
) {
  const earthRadiusM = 6371000;
  const dLatitude = toRadians(bLatitude - aLatitude);
  const dLongitude = toRadians(bLongitude - aLongitude);
  const latitude1 = toRadians(aLatitude);
  const latitude2 = toRadians(bLatitude);

  const haversine =
    Math.sin(dLatitude / 2) * Math.sin(dLatitude / 2) +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(dLongitude / 2) *
      Math.sin(dLongitude / 2);

  return 2 * earthRadiusM * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

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
  const { trackId } = useLocalSearchParams<{ trackId?: string }>();
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
  const [weather, setWeather] = useState<TrackWeather | null>(null);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const gradientColors = useHeaderGradient('emerald');
  const { openMenu } = useMenu();
  const [userCar, setUserCar] = useState<string | null>(null);
  const [customSessionTitle, setCustomSessionTitle] = useState<string | null>(null);
  const [hasManualTrackSelection, setHasManualTrackSelection] = useState(false);
  const [hasResolvedAutoSelection, setHasResolvedAutoSelection] = useState(false);
  const pulseOpacity = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withTiming(0.3, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [pulseOpacity]);

  const badgeOpacity = useSharedValue(0.5);
  const badgeStyle = useAnimatedStyle(() => ({ opacity: badgeOpacity.value }));
  const [circuitSearch, setCircuitSearch] = useState('');
  const sessionTitle: string = customSessionTitle ?? (i18n.t('preSession.sessionTitle', { number: sessionNumber }) as string);

  const filteredCircuits = useMemo(() => {
    if (!circuitSearch.trim()) return circuits;
    const query = circuitSearch.toLowerCase().trim();
    return circuits.filter(
      (c) => c.name.toLowerCase().includes(query) || c.country?.toLowerCase().includes(query)
    );
  }, [circuits, circuitSearch]);

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
            return nextCircuits.find((circuit) => circuit.id === currentCircuit.id) ?? null;
          }

          return null;
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
    getOrCreateDefaultUserProfile(db).then((user) => setUserCar(user.car));
  }, [db]);

  useEffect(() => {
    if (!trackId || circuits.length === 0) {
      return;
    }

    const match = circuits.find((c) => c.id === trackId);
    if (match) {
      setSelectedCircuit(match);
      setHasManualTrackSelection(true);
    }
    router.setParams({ trackId: undefined });
  }, [router, trackId, circuits]);

  useEffect(() => {
    let isMounted = true;

    async function autoSelectNearestTrack() {
      if (hasManualTrackSelection || hasResolvedAutoSelection || circuits.length === 0) {
        return;
      }

      try {
        let permissionState = await getForegroundLocationPermissionState();

        if (permissionState === 'undetermined') {
          permissionState = await requestForegroundLocationPermission();
        }

        if (permissionState !== 'granted') {
          if (isMounted) {
            setHasResolvedAutoSelection(true);
          }
          return;
        }

        const locationSample = await getCurrentLocationSample();

        if (!locationSample) {
          if (isMounted) {
            setHasResolvedAutoSelection(true);
          }
          return;
        }

        let nearestCircuit: TrackListItem | null = null;
        let nearestDistanceM = Number.POSITIVE_INFINITY;

        for (const circuit of circuits) {
          if (circuit.centerLatitude === null || circuit.centerLongitude === null) {
            continue;
          }

          const distanceM = getDistanceMeters(
            locationSample.lat,
            locationSample.lng,
            circuit.centerLatitude,
            circuit.centerLongitude
          );

          if (distanceM < nearestDistanceM) {
            nearestDistanceM = distanceM;
            nearestCircuit = circuit;
          }
        }

        if (!isMounted) {
          return;
        }

        if (nearestCircuit && nearestDistanceM <= AUTO_SELECT_MAX_DISTANCE_M) {
          setSelectedCircuit(nearestCircuit);
        }

        setHasResolvedAutoSelection(true);
      } catch {
        if (isMounted) {
          setHasResolvedAutoSelection(true);
        }
      }
    }

    void autoSelectNearestTrack();

    return () => {
      isMounted = false;
    };
  }, [circuits, hasManualTrackSelection, hasResolvedAutoSelection]);

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

    async function loadWeather() {
      if (
        !selectedCircuit ||
        selectedCircuit.centerLatitude === null ||
        selectedCircuit.centerLongitude === null
      ) {
        if (isMounted) {
          setWeather(null);
        }
        return;
      }

      setWeather(null);

    try {
        const nextWeather = await fetchTrackWeather(
          selectedCircuit.centerLatitude,
          selectedCircuit.centerLongitude
        );

        if (!isMounted) {
          return;
        }

        setWeather(nextWeather);
      } catch {
        if (!isMounted) {
          return;
        }

        setWeather(null);
      }
    }

    void loadWeather();

    return () => {
      isMounted = false;
    };
  }, [selectedCircuit]);

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

  useFocusEffect(
    useCallback(() => {
      setCustomSessionTitle(null);

      let isMounted = true;
      async function refreshSessionNumber() {
        try {
          const next = await getNextSessionNumber(db);
          if (isMounted) setSessionNumber(next);
        } catch {
          if (isMounted) setSessionNumber(1);
        }
      }
      void refreshSessionNumber();
      return () => { isMounted = false; };
    }, [db])
  );

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

  function formatTemperature(value: number | null) {
    if (value === null) {
      return i18n.t('common.tbd');
    }

    return `${Math.round(value)}°C`;
  }

  function formatWindSpeed(value: number | null) {
    if (value === null) {
      return i18n.t('common.tbd');
    }

    return `${Math.round(value)} km/h`;
  }

  const readyChecklistCount = checklistItems.filter((item) => item.status === 'ready').length;
  const isSessionReady =
    checklistItems.find((i) => i.key === 'gpsLock')?.status === 'ready' &&
    checklistItems.find((i) => i.key === 'startFinishLineSet')?.status === 'ready';

  useEffect(() => {
    if (isSessionReady) {
      badgeOpacity.value = 1;
      badgeOpacity.value = withRepeat(
        withTiming(0.5, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      cancelAnimation(badgeOpacity);
      badgeOpacity.value = withTiming(0.5, { duration: 300 });
    }
  }, [isSessionReady, badgeOpacity]);

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
            <View className="flex-row items-center gap-3">
              <Pressable onPress={openMenu} hitSlop={8}>
                <Ionicons name="menu" size={22} color={isDark ? '#a1a1aa' : '#71717a'} />
              </Pressable>
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('preSession.title')}</Text>
            </View>
            <Animated.View style={badgeStyle} className="flex-row items-center gap-2 rounded-full bg-emerald-500/30 px-3 py-1.5 border border-emerald-400/40">
              <View className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <Text className="text-sm text-emerald-400">{i18n.t('session.ready')}</Text>
            </Animated.View>
          </View>

          {/* Title + READY badge */}
          <View className="mb-4">
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('preSession.readyToRecord')}</Text>
            <EditableSessionTitle title={sessionTitle} onChangeTitle={(t) => setCustomSessionTitle(t)} />
          </View>

          {/* Track Selection */}
          <View className="rounded-3xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10 p-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('preSession.selectedCircuit')}</Text>
              <Pressable onPress={() => { setShowCircuitPicker(!showCircuitPicker); setCircuitSearch(''); }}>
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
            ) : !selectedCircuit && circuits.length === 0 ? (
              <View className="rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 py-3">
                <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('circuits.noTracksFound')}</Text>
                <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {i18n.t('circuits.noTracksFoundHint')}
                </Text>
              </View>
            ) : !selectedCircuit && !showCircuitPicker && !hasResolvedAutoSelection ? (
              <Animated.View style={pulseStyle} className="rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 py-3">
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('preSession.detectingTrack')}</Text>
              </Animated.View>
            ) : !selectedCircuit && !showCircuitPicker ? (
              <Pressable
                onPress={() => { setShowCircuitPicker(true); setCircuitSearch(''); }}
                className="flex-row items-center justify-between rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 py-3"
              >
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('preSession.selectTrack')}</Text>
                <Ionicons name="chevron-forward" size={16} color="#71717a" />
              </Pressable>
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
                <View className="flex-row items-center rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 py-2">
                  <Ionicons name="search" size={16} color={isDark ? '#a1a1aa' : '#71717a'} />
                  <TextInput
                    className="flex-1 ml-2 text-sm text-zinc-900 dark:text-white p-0"
                    placeholder={i18n.t('circuits.searchTracks')}
                    placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
                    value={circuitSearch}
                    onChangeText={setCircuitSearch}
                    autoCorrect={false}
                  />
                  {circuitSearch.length > 0 && (
                    <Pressable onPress={() => setCircuitSearch('')} hitSlop={8}>
                      <Ionicons name="close-circle" size={16} color={isDark ? '#71717a' : '#a1a1aa'} />
                    </Pressable>
                  )}
                </View>
                <ScrollView
                  style={{ maxHeight: 250 }}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {filteredCircuits.length > 0 ? (
                    filteredCircuits.map((circuit) => (
                      <Pressable
                        key={circuit.id}
                        onPress={() => {
                          setSelectedCircuit(circuit);
                          setHasManualTrackSelection(true);
                          setShowCircuitPicker(false);
                          setCircuitSearch('');
                        }}
                        className={`flex-row items-center justify-between rounded-2xl px-3 py-2.5 mb-2 border ${
                          selectedCircuit?.id === circuit.id
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
                        {selectedCircuit?.id === circuit.id && (
                          <Ionicons name="checkmark" size={16} color="#34d399" />
                        )}
                      </Pressable>
                    ))
                  ) : (
                    <View className="rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 py-3">
                      <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('circuits.noTracksFound')}</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Car */}
          <Pressable
            onPress={() => router.push('/profile')}
            className="mt-3 rounded-3xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10 px-4 py-3.5 flex-row items-center"
          >
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('profile.car')}</Text>
            <Text className={`flex-1 text-sm font-medium text-center ${userCar ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 dark:text-zinc-500'}`}>
              {userCar ?? i18n.t('preSession.setCar')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={isDark ? '#52525b' : '#a1a1aa'} />
          </Pressable>

          {/* Start button */}
          <View className="mt-4">
            <Pressable
              onPress={() => {
                if (!selectedCircuit) {
                  return;
                }

                router.push({
                  pathname: '/(tabs)/record/recording',
                  params: {
                    trackId: selectedCircuit.id,
                    sessionName: sessionTitle,
                    condition: weather?.conditionKey ?? '',
                    temperatureC: weather?.temperatureC != null ? String(weather.temperatureC) : '',
                  },
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
              <Text className="text-2xl mb-1 text-center">{weather?.emoji ?? '—'}</Text>
              <Text className="text-sm font-semibold text-zinc-900 dark:text-white text-center">
                {weather ? i18n.t(`preSession.${weather.conditionKey}`) : i18n.t('common.tbd')}
              </Text>
            </View>
            <View className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3">
              <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{i18n.t('preSession.airTemp')}</Text>
              <View className="flex-1 justify-center">
                <Text className="text-lg font-semibold text-zinc-900 dark:text-white text-center">{formatTemperature(weather?.temperatureC ?? null)}</Text>
              </View>
            </View>
            <View className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3">
              <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{i18n.t('preSession.wind')}</Text>
              <View className="flex-1 justify-center">
                <Text className="text-lg font-semibold text-zinc-900 dark:text-white text-center">{formatWindSpeed(weather?.windSpeedKph ?? null)}</Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400 text-center">{weather?.windDirectionCardinal ?? i18n.t('common.tbd')}</Text>
              </View>
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
