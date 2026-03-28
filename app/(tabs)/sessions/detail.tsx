import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, FlatList, Dimensions, Pressable, TextInput, KeyboardAvoidingView, Platform, Alert, Modal, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import MapView, { Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import i18n from '@/i18n';
import StatusPill from '@/components/StatusPill';
import Card from '@/components/Card';
import EditableSessionTitle from '@/components/EditableSessionTitle';
import LapBreakdown from '@/components/LapBreakdown';
import type { LapBreakdownItem } from '@/components/LapBreakdown';
import ProgressBar from '@/components/ProgressBar';
import Checkerboard from '@/components/share/Checkerboard';
import SessionStoryCard from '@/components/share/SessionStoryCard';
import type { SessionDetail, SessionNoteRow } from '@/db';
import {
  addSessionNote,
  deleteSession,
  deleteSessionNote,
  getSessionById,
  updateSessionName,
  updateSessionNote,
} from '@/db';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';
import { shareSessionToInstagramStory } from '@/services/share';

function formatLapTime(lapTimeMs: number | null) {
  if (lapTimeMs === null) {
    return '--:--.---';
  }

  const totalSeconds = lapTimeMs / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;

  return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
}

function formatSectorTime(splitTimeMs: number | null) {
  if (splitTimeMs === null) {
    return '---.---';
  }

  return (splitTimeMs / 1000).toFixed(3);
}

function formatDeltaMs(deltaMs: number | null) {
  if (deltaMs === null) {
    return null;
  }

  const sign = deltaMs >= 0 ? '+' : '−';
  return `${sign}${(Math.abs(deltaMs) / 1000).toFixed(3)}`;
}

function formatGapSeconds(deltaMs: number | null) {
  if (deltaMs === null) {
    return i18n.t('common.tbd');
  }

  return (Math.abs(deltaMs) / 1000).toFixed(3);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return i18n.t('common.tbd');
  }

  return new Date(value).toLocaleString(i18n.locale === 'ja' ? 'ja-JP' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(startedAt: string, endedAt: string | null) {
  if (!endedAt) {
    return i18n.t('common.tbd');
  }

  const diffMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return i18n.t('common.tbd');
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatSpeed(maxSpeedKph: number | null) {
  if (maxSpeedKph === null) {
    return i18n.t('common.tbd');
  }

  return `${Math.round(maxSpeedKph)} km/h`;
}

function getMapLatitudeDelta(lengthMeters: number | null) {
  if (!lengthMeters) {
    return 0.0035;
  }

  return Math.min(Math.max(lengthMeters / 450000, 0.0015), 0.0055);
}

function getSectorCount(sessionDetail: SessionDetail | null) {
  if (!sessionDetail) {
    return 0;
  }

  const sectorLineCount = sessionDetail.timingLines.filter((timingLine) => timingLine.type === 'sector').length;
  const hasStartFinish = sessionDetail.timingLines.some((timingLine) => timingLine.type === 'start_finish');

  if (sectorLineCount === 0) {
    return 0;
  }

  return sectorLineCount + (hasStartFinish ? 1 : 0);
}

function getValidTimedLaps(sessionDetail: SessionDetail | null) {
  return (sessionDetail?.laps ?? []).filter(
    (lap) => lap.lapTimeMs !== null && lap.isInvalid === 0 && lap.isOutLap === 0
  );
}

function getBestLapMs(sessionDetail: SessionDetail | null) {
  if (!sessionDetail) {
    return null;
  }

  if (sessionDetail.session.bestLapMs !== null) {
    return sessionDetail.session.bestLapMs;
  }

  const validTimedLaps = getValidTimedLaps(sessionDetail);
  if (validTimedLaps.length === 0) {
    return null;
  }

  return Math.min(...validTimedLaps.map((lap) => lap.lapTimeMs ?? Number.MAX_SAFE_INTEGER));
}

function getTopSpeedKph(sessionDetail: SessionDetail | null) {
  if (!sessionDetail) {
    return null;
  }

  const speedCandidates = [
    sessionDetail.session.maxSpeedKph,
    ...sessionDetail.laps.map((lap) => lap.maxSpeedKph),
    ...sessionDetail.gpsPoints.map((point) => (point.speedMps !== null ? point.speedMps * 3.6 : null)),
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
      .map((lap) => lap.sectors.find((sector) => sector.sectorIndex === index)?.splitTimeMs ?? null)
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
  const average = lapTimes.reduce((sum, value) => sum + value, 0) / lapTimes.length;
  const spread = Math.max(...lapTimes) - Math.min(...lapTimes);
  const score = 100 - (spread / average) * 100;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getLapBreakdownItems(sessionDetail: SessionDetail | null): LapBreakdownItem[] {
  const validTimedLaps = getValidTimedLaps(sessionDetail);
  const bestLapMs = getBestLapMs(sessionDetail);
  const sectorCount = getSectorCount(sessionDetail);

  return validTimedLaps.map((lap) => {
    const sectorMs = Array.from({ length: sectorCount }, (_, index) => {
      const sector = lap.sectors.find((lapSector) => lapSector.sectorIndex === index);
      return sector?.splitTimeMs ?? null;
    });
    const deltaMs =
      bestLapMs !== null && lap.lapTimeMs !== null && lap.lapTimeMs !== bestLapMs
        ? lap.lapTimeMs - bestLapMs
        : null;

    return {
      lap: lap.lapNumber,
      time: formatLapTime(lap.lapTimeMs),
      timeMs: lap.lapTimeMs ?? 0,
      delta: deltaMs === null ? null : formatDeltaMs(deltaMs),
      sectors: sectorMs.map((value) => formatSectorTime(value)),
      sectorMs,
    };
  });
}

function getAverageLapDeltaLabel(sessionDetail: SessionDetail | null) {
  const validTimedLaps = getValidTimedLaps(sessionDetail);

  if (validTimedLaps.length < 2) {
    return i18n.t('common.tbd');
  }

  const deltas = validTimedLaps.slice(1).map((lap, index) => {
    const previousLap = validTimedLaps[index];
    return (lap.lapTimeMs ?? 0) - (previousLap.lapTimeMs ?? 0);
  });
  const averageDelta = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  const sign = averageDelta >= 0 ? '+' : '−';

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
        : Math.round(55 + ((slowest - (lap.lapTimeMs ?? slowest)) / range) * 45),
  }));
}

function getDisplayGpsLine(sessionDetail: SessionDetail | null) {
  const gpsPoints = (sessionDetail?.gpsPoints ?? []).filter(
    (point) => point.accuracyM === null || point.accuracyM <= 20
  );

  if (gpsPoints.length <= 2) {
    return gpsPoints.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    }));
  }

  return gpsPoints.map((point, index, points) => {
    if (index === 0 || index === points.length - 1) {
      return {
        latitude: point.latitude,
        longitude: point.longitude,
      };
    }

    const previousPoint = points[index - 1];
    const nextPoint = points[index + 1];

    return {
      latitude:
        (previousPoint.latitude + point.latitude + nextPoint.latitude) / 3,
      longitude:
        (previousPoint.longitude + point.longitude + nextPoint.longitude) / 3,
    };
  });
}

function getMapRegion(sessionDetail: SessionDetail | null) {
  if (!sessionDetail) {
    return null;
  }

  const mapLatitudeDelta = getMapLatitudeDelta(sessionDetail.track.lengthMeters);

  if (
    sessionDetail.track.centerLatitude !== null &&
    sessionDetail.track.centerLongitude !== null
  ) {
    return {
      latitude: sessionDetail.track.centerLatitude,
      longitude: sessionDetail.track.centerLongitude,
      latitudeDelta: mapLatitudeDelta,
      longitudeDelta: mapLatitudeDelta * 1.25,
    };
  }

  if (sessionDetail.gpsPoints.length === 0) {
    return null;
  }

  const latitudes = sessionDetail.gpsPoints.map((point) => point.latitude);
  const longitudes = sessionDetail.gpsPoints.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(maxLat - minLat, 0.0015) * 1.4,
    longitudeDelta: Math.max(maxLng - minLng, 0.0015) * 1.4,
  };
}

const STORY_TEMPLATES = ['dark', 'transparent'] as const;
const previewPageWidth = Dimensions.get('window').width;
const viewabilityConfig = { itemVisiblePercentThreshold: 50 };

export default function SessionDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gradientColors = useHeaderGradient('violet');
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const scrollRef = useRef<ScrollView>(null);
  const storyCardRef = useRef<View>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [isShareSheetVisible, setIsShareSheetVisible] = useState(false);
  const [isStoryPreviewVisible, setIsStoryPreviewVisible] = useState(false);
  const [storyTemplate, setStoryTemplate] = useState<'dark' | 'transparent'>('dark');

  const onTemplateChange = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.item) {
      setStoryTemplate(first.item as 'dark' | 'transparent');
    }
  }).current;

  const loadSession = useCallback(async () => {
    if (!id) {
      setLoadError(i18n.t('sessions.sessionNotFound'));
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const nextSessionDetail = await getSessionById(db, id);

      if (!nextSessionDetail) {
        setLoadError(i18n.t('sessions.sessionNotFound'));
        setSessionDetail(null);
        return;
      }

      setSessionDetail(nextSessionDetail);
      setLoadError(null);
    } catch {
      setLoadError(i18n.t('sessions.unableToLoadSession'));
    } finally {
      setIsLoading(false);
    }
  }, [db, id]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  async function handleAddNote() {
    const text = newNote.trim();
    if (!text || !sessionDetail) {
      return;
    }

    const note = await addSessionNote(db, sessionDetail.session.id, text);
    setSessionDetail({ ...sessionDetail, notes: [...sessionDetail.notes, note] });
    setNewNote('');
  }

  async function handleUpdateNote(noteId: string) {
    const text = editingNoteText.trim();
    if (!text || !sessionDetail) {
      return;
    }

    await updateSessionNote(db, noteId, text);
    setSessionDetail({
      ...sessionDetail,
      notes: sessionDetail.notes.map((note) =>
        note.id === noteId ? { ...note, note: text } : note
      ),
    });
    setEditingNoteId(null);
    setEditingNoteText('');
  }

  async function handleDeleteNote(noteId: string) {
    if (!sessionDetail) {
      return;
    }

    await deleteSessionNote(db, noteId);
    setSessionDetail({
      ...sessionDetail,
      notes: sessionDetail.notes.filter((note) => note.id !== noteId),
    });
  }

  async function handleChangeTitle(newTitle: string) {
    if (!sessionDetail) return;
    await updateSessionName(db, sessionDetail.session.id, newTitle);
    setSessionDetail({
      ...sessionDetail,
      session: { ...sessionDetail.session, name: newTitle },
    });
  }

  function handleDeleteSession() {
    if (!sessionDetail) return;
    Alert.alert(
      i18n.t('sessions.deleteTitle'),
      i18n.t('sessions.deleteMessage', { name: sessionDetail.session.name }),
      [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        {
          text: i18n.t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteSession(db, sessionDetail.session.id);
            router.back();
          },
        },
      ]
    );
  }

  async function handleShareSession() {
    if (!sessionDetail || !storyCardRef.current || isSharing) {
      return;
    }

    try {
      setIsSharing(true);
      const storyUri = await captureRef(storyCardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      console.log('[share] captured story uri', storyUri);

      const result = await shareSessionToInstagramStory(storyUri);
      console.log('[share] instagram story result', result);

      if (result.ok) {
        setIsStoryPreviewVisible(false);
        return;
      }

      const baseMessage =
        result.reason === 'missing_app_id'
          ? i18n.t('sessions.shareConfigurationMissing')
          : result.reason === 'instagram_unavailable'
            ? i18n.t('sessions.instagramUnavailable')
            : i18n.t('sessions.shareFailed');

      const message = result.message ? `${baseMessage}\n\n${result.message}` : baseMessage;

      Alert.alert(i18n.t('sessions.share'), message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log('[share] capture/share exception', message);
      Alert.alert(i18n.t('sessions.share'), `${i18n.t('sessions.shareFailed')}\n\n${message}`);
    } finally {
      setIsSharing(false);
    }
  }

  async function handleSaveToGallery() {
    if (!sessionDetail || !storyCardRef.current || isSharing) {
      return;
    }

    try {
      setIsSharing(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(i18n.t('sessions.share'), i18n.t('sessions.galleryPermissionDenied'));
        return;
      }

      const uri = await captureRef(storyCardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert(i18n.t('sessions.share'), i18n.t('sessions.savedToGallery'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert(i18n.t('sessions.share'), `${i18n.t('sessions.saveToGalleryFailed')}\n\n${message}`);
    } finally {
      setIsSharing(false);
    }
  }

  function openShareSheet() {
    if (!sessionDetail || isSharing) {
      return;
    }

    setIsShareSheetVisible(true);
  }

  function openInstagramStoryPreview() {
    setIsShareSheetVisible(false);
    setIsStoryPreviewVisible(true);
  }

  function startEditingNote(note: SessionNoteRow) {
    setEditingNoteId(note.id);
    setEditingNoteText(note.note);
  }

  function cancelEditingNote() {
    setEditingNoteId(null);
    setEditingNoteText('');
  }

  const bestLapMs = getBestLapMs(sessionDetail);
  const topSpeedKph = getTopSpeedKph(sessionDetail);
  const theoreticalBestMs = getTheoreticalBestMs(sessionDetail);
  const lapBreakdownItems = getLapBreakdownItems(sessionDetail);
  const trendBars = getTrendBars(sessionDetail);
  const mapRegion = getMapRegion(sessionDetail);
  const startFinishLine =
    sessionDetail?.timingLines.find((timingLine) => timingLine.type === 'start_finish') ?? null;
  const gpsLine = getDisplayGpsLine(sessionDetail);

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
      style={{ backgroundColor: isDark ? '#18181b' : '#fafafa' }}
    >
    <View className="flex-1 bg-zinc-50 dark:bg-zinc-900 overflow-hidden">
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
          <View className="flex-row items-center justify-between mb-4">
            <Pressable onPress={() => router.back()}>
              <Text className="text-sm font-medium text-violet-400">{i18n.t('common.back')}</Text>
            </Pressable>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">
              {sessionDetail?.track.name ?? i18n.t('common.track')}
            </Text>
          </View>

          <View className="flex-row items-start justify-between mb-5">
            <View className="flex-1 mr-3">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.recordedSession')}</Text>
              <EditableSessionTitle
                title={sessionDetail?.session.name ?? i18n.t('sessions.recordedSession')}
                onChangeTitle={handleChangeTitle}
              />
              <Text className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                {sessionDetail ? formatDateTime(sessionDetail.session.startedAt) : i18n.t('common.loading')}
              </Text>
            </View>
            {sessionDetail?.displayStatus ? (
              <StatusPill
                text={
                  sessionDetail.displayStatus === 'Best'
                    ? i18n.t('sessions.bestRun')
                    : i18n.t('sessions.recent')
                }
                color="violet"
              />
            ) : null}
          </View>

          <View className="rounded-3xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10 p-4">
            <View className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-zinc-200 dark:bg-zinc-950/80 mb-3 h-80 overflow-hidden">
              {mapRegion ? (
                <MapView
                  initialRegion={mapRegion}
                  mapType="satellite"
                  rotateEnabled={true}
                  pitchEnabled={true}
                  toolbarEnabled={false}
                  style={{ flex: 1 }}
                >
                  {gpsLine.length > 1 ? (
                    <Polyline
                      coordinates={gpsLine}
                      strokeColor="#f59e0b"
                      strokeWidth={3}
                    />
                  ) : null}
                  {startFinishLine ? (
                    <Polyline
                      coordinates={[startFinishLine.a, startFinishLine.b]}
                      strokeColor="#ef4444"
                      strokeWidth={4}
                    />
                  ) : null}
                </MapView>
              ) : (
                <View className="flex-1 items-center justify-center p-5">
                  <Text className="text-zinc-400 dark:text-zinc-500 text-sm">{i18n.t('circuits.trackMap')}</Text>
                </View>
              )}
            </View>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                <View className="h-0.5 w-3 rounded-full bg-red-500" />
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  {i18n.t('circuits.startFinish')}
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View className="h-0.5 w-3 rounded-full bg-violet-400" />
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  {i18n.t('sessions.gpsLine')}
                </Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        <View className="px-5 py-4 gap-4">
          {loadError ? (
            <Card>
              <Text className="text-sm text-red-700 dark:text-red-200">{loadError}</Text>
            </Card>
          ) : null}

          {isLoading ? (
            <Card>
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.loadingSession')}</Text>
            </Card>
          ) : null}

          <View className="rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-4">
            <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{i18n.t('session.bestLap')}</Text>
            <Text
              className="text-zinc-900 dark:text-white text-center"
              style={{ fontSize: 40, lineHeight: 44, fontWeight: '600', fontVariant: ['tabular-nums'] }}
            >
              {formatLapTime(bestLapMs)}
            </Text>
          </View>

          <View className="flex-row gap-3">
            {[
              { label: i18n.t('session.topSpeed'), value: formatSpeed(topSpeedKph) },
              {
                label: i18n.t('session.duration'),
                value: sessionDetail
                  ? formatDuration(sessionDetail.session.startedAt, sessionDetail.session.endedAt)
                  : i18n.t('common.tbd'),
              },
              {
                label: i18n.t('session.totalLaps'),
                value: `${sessionDetail?.session.totalLaps ?? 0}`,
              },
            ].map((metric) => (
              <View key={metric.label} className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{metric.label}</Text>
                <Text className="text-lg font-semibold text-zinc-900 dark:text-white">{metric.value}</Text>
              </View>
            ))}
          </View>

          <Card>
            <View className="mb-4">
              <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('sessions.sessionInsights')}</Text>
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.performanceSummary')}</Text>
            </View>

            <View className="mb-4">
              <ProgressBar
                label={i18n.t('postSession.consistency')}
                value={`${getConsistencyValue(sessionDetail)}%`}
                color="bg-white dark:bg-white"
              />
            </View>

            <View className="mb-4">
              <View className="flex-row justify-between mb-1">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.theoreticalBest')}</Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{formatLapTime(theoreticalBestMs)}</Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="flex-1 h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
                  <View
                    className="h-full rounded-full bg-violet-400"
                    style={{
                      width:
                        bestLapMs !== null && theoreticalBestMs !== null && bestLapMs > 0
                          ? `${Math.max(0, Math.min(100, Math.round((theoreticalBestMs / bestLapMs) * 100)))}%`
                          : '0%',
                    }}
                  />
                </View>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  {i18n.t('sessions.gap', {
                    gap:
                      bestLapMs !== null && theoreticalBestMs !== null
                        ? formatGapSeconds(bestLapMs - theoreticalBestMs)
                        : i18n.t('common.tbd'),
                  })}
                </Text>
              </View>
              <Text className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{i18n.t('sessions.bestSectorsCombined')}</Text>
            </View>

            <View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.lapDeltaTrend')}</Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  {i18n.t('sessions.avgPerLap', { delta: getAverageLapDeltaLabel(sessionDetail) })}
                </Text>
              </View>
              <View className="flex-row gap-1.5 items-end h-16">
                {trendBars.map((bar) => (
                  <View key={bar.lap} className="flex-1 items-center">
                    <View
                      className={`w-full rounded-md ${bar.best ? 'bg-violet-400' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                      style={{ height: `${bar.height}%` }}
                    />
                  </View>
                ))}
              </View>
              <View className="flex-row justify-between mt-1">
                <Text className="text-xs text-zinc-400 dark:text-zinc-500">
                  {i18n.t('sessions.lapLabel', { number: trendBars[0]?.lap ?? 0 })}
                </Text>
                <Text className="text-xs text-zinc-400 dark:text-zinc-500">
                  {i18n.t('sessions.lapLabel', { number: trendBars[trendBars.length - 1]?.lap ?? 0 })}
                </Text>
              </View>
            </View>
          </Card>

          {lapBreakdownItems.length > 0 ? (
            <LapBreakdown laps={lapBreakdownItems} accentColor="violet" />
          ) : (
            <Card>
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.noLapDataYet')}</Text>
            </Card>
          )}

          <Card>
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('sessions.sessionNotes')}</Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.sessionNotesSubtitle')}</Text>
              </View>
              <Pressable
                onPress={() => {
                  setIsEditing(!isEditing);
                  cancelEditingNote();
                  setNewNote('');
                }}
                className="rounded-full px-4 py-2"
                hitSlop={8}
              >
                <Text className="text-sm font-medium text-violet-400">
                  {isEditing ? i18n.t('common.done') : i18n.t('common.edit')}
                </Text>
              </Pressable>
            </View>
            <View className="gap-2">
              {sessionDetail?.notes.length ? (
                sessionDetail.notes.map((note) => (
                  <View key={note.id}>
                    {editingNoteId === note.id ? (
                      <View className="rounded-2xl bg-zinc-50 dark:bg-black/20 border border-violet-400/40 p-4">
                        <TextInput
                          style={{ color: isDark ? '#e4e4e7' : '#3f3f46', fontSize: 15, padding: 0, minHeight: 48 }}
                          value={editingNoteText}
                          onChangeText={setEditingNoteText}
                          autoFocus
                          multiline
                        />
                        <View className="flex-row gap-3 justify-end mt-3">
                          <Pressable
                            onPress={cancelEditingNote}
                            className="rounded-xl px-5 py-2.5 bg-zinc-200 dark:bg-white/10"
                            hitSlop={4}
                          >
                            <Text className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{i18n.t('common.cancel')}</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleUpdateNote(note.id)}
                            className="rounded-xl px-5 py-2.5 bg-violet-500"
                            hitSlop={4}
                          >
                            <Text className="text-sm font-medium text-white">{i18n.t('common.save')}</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View className="flex-row items-center gap-2">
                        {isEditing ? (
                          <Pressable
                            onPress={() => handleDeleteNote(note.id)}
                            className="items-center justify-center w-10 h-10 rounded-full bg-red-500/10"
                            hitSlop={4}
                          >
                            <Ionicons name="remove-circle" size={22} color="#ef4444" />
                          </Pressable>
                        ) : null}
                        <Pressable
                          onPress={isEditing ? () => startEditingNote(note) : undefined}
                          disabled={!isEditing}
                          className="flex-1 rounded-2xl bg-zinc-50 dark:bg-black/20 px-4 py-3 border border-zinc-100 dark:border-white/5"
                        >
                          <Text className="text-sm text-zinc-700 dark:text-zinc-200 leading-5">{note.note}</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                ))
              ) : !isEditing ? (
                <View className="rounded-2xl bg-zinc-50 dark:bg-black/20 px-4 py-3 border border-zinc-100 dark:border-white/5">
                  <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.noSessionNotesYet')}</Text>
                </View>
              ) : null}

              {isEditing ? (
                <View className="rounded-2xl bg-zinc-50 dark:bg-black/20 border border-dashed border-zinc-300 dark:border-white/10 p-4">
                  <TextInput
                    style={{ color: isDark ? '#e4e4e7' : '#3f3f46', fontSize: 15, padding: 0, minHeight: 44 }}
                    placeholder={i18n.t('sessions.addSessionNotePlaceholder')}
                    placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
                    value={newNote}
                    onChangeText={setNewNote}
                    onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
                    multiline
                  />
                  {newNote.trim().length > 0 ? (
                    <Pressable
                      onPress={handleAddNote}
                      className="mt-3 self-end rounded-xl px-5 py-2.5 bg-violet-500"
                      hitSlop={4}
                    >
                      <Text className="text-sm font-medium text-white">{i18n.t('circuits.addNote')}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          </Card>
        </View>

        <View className="px-5 pb-5 pt-1 flex-row gap-3">
          {/* TODO: Export not yet implemented
          <Pressable className="flex-1 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 py-3.5 items-center">
            <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('sessions.exportData')}</Text>
          </Pressable>
          */}
          <Pressable
            onPress={openShareSheet}
            disabled={isSharing || !sessionDetail}
            className={`flex-1 rounded-2xl py-3.5 items-center ${isSharing || !sessionDetail ? 'bg-violet-500/60' : 'bg-violet-500'}`}
          >
            <Text className="text-sm font-semibold text-white">
              {isSharing ? i18n.t('sessions.preparingShare') : i18n.t('sessions.share')}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleDeleteSession}
            className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 py-3.5 px-3.5 items-center justify-center"
          >
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
          </Pressable>
        </View>

        {sessionDetail ? (
          <View
            ref={storyCardRef}
            collapsable={false}
            pointerEvents="none"
            style={{ position: 'absolute', left: -10000, top: 0 }}
          >
            <SessionStoryCard
              sessionName={sessionDetail.session.name ?? i18n.t('sessions.recordedSession')}
              circuitName={sessionDetail.track.name}
              location={[sessionDetail.track.location, sessionDetail.track.country].filter(Boolean).join(', ')}
              bestLap={formatLapTime(bestLapMs)}
              totalLaps={`${sessionDetail.session.totalLaps}`}
              topSpeed={formatSpeed(topSpeedKph)}
              bestLapLabel={i18n.t('sessions.storyBestLap')}
              totalLapsLabel={i18n.t('sessions.storyTotalLaps')}
              topSpeedLabel={i18n.t('sessions.storyTopSpeed')}
              variant={storyTemplate}
            />
          </View>
        ) : null}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={isShareSheetVisible}
        onRequestClose={() => setIsShareSheetVisible(false)}
      >
        <Pressable
          onPress={() => setIsShareSheetVisible(false)}
          className="flex-1 bg-black/60 justify-end"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="rounded-t-3xl bg-zinc-100 dark:bg-zinc-900 px-5 pt-6 pb-10"
          >
            <View className="mb-5 items-center">
              <View className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
            </View>
            <Text className="text-base font-semibold text-zinc-900 dark:text-white mb-4">
              {i18n.t('sessions.shareTo')}
            </Text>

            {/* Share destinations */}
            <Pressable
              onPress={openInstagramStoryPreview}
              className="flex-row items-center gap-4 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3.5"
            >
              <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: '#E1306C15' }}>
                <Ionicons name="logo-instagram" size={22} color="#E1306C" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {i18n.t('sessions.instagramStory')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={isDark ? '#52525b' : '#a1a1aa'} />
            </Pressable>

            <Pressable
              onPress={() => setIsShareSheetVisible(false)}
              className="mt-4 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-200/70 dark:bg-white/5 py-3.5 items-center"
            >
              <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                {i18n.t('common.cancel')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="slide"
        visible={isStoryPreviewVisible}
        presentationStyle="fullScreen"
        onRequestClose={() => setIsStoryPreviewVisible(false)}
      >
        <View className="flex-1 bg-zinc-50 dark:bg-zinc-950" style={{ paddingTop: insets.top }}>
          <View className="flex-row items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-white/10">
            <Pressable onPress={() => setIsStoryPreviewVisible(false)} className="w-16 py-1">
              <Text className="text-[15px] text-zinc-500 dark:text-zinc-400">{i18n.t('common.cancel')}</Text>
            </Pressable>
            <Text className="text-[15px] font-semibold text-zinc-900 dark:text-white">{i18n.t('sessions.previewStory')}</Text>
            <Pressable onPress={handleShareSession} disabled={isSharing} className="w-16 items-end py-1">
              <Text className={`text-[15px] font-semibold ${isSharing ? 'text-violet-400/50' : 'text-violet-500 dark:text-violet-400'}`}>
                {isSharing ? i18n.t('sessions.preparingShare') : i18n.t('sessions.share')}
              </Text>
            </Pressable>
          </View>

          <View className="flex-1 items-center justify-center">
            <FlatList
              data={STORY_TEMPLATES}
              keyExtractor={(item) => item}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onViewableItemsChanged={onTemplateChange}
              viewabilityConfig={viewabilityConfig}
              style={{ flexGrow: 0 }}
              renderItem={({ item: variant }) => (
                <View style={{ width: previewPageWidth, alignItems: 'center' }}>
                  <View
                    className="overflow-hidden rounded-3xl border border-zinc-200 dark:border-white/10"
                    style={{ width: 306, height: 544 }}
                  >
                    {variant === 'transparent' ? (
                      <Checkerboard width={306} height={544} squareSize={16} />
                    ) : null}
                    {sessionDetail ? (
                      <View style={{ width: 720, height: 1280, transform: [{ scale: 0.425 }], transformOrigin: 'top left' }}>
                        <SessionStoryCard
                          sessionName={sessionDetail.session.name ?? i18n.t('sessions.recordedSession')}
                          circuitName={sessionDetail.track.name}
                          location={[sessionDetail.track.location, sessionDetail.track.country].filter(Boolean).join(', ')}
                          bestLap={formatLapTime(bestLapMs)}
                          totalLaps={`${sessionDetail.session.totalLaps}`}
                          topSpeed={formatSpeed(topSpeedKph)}
                          bestLapLabel={i18n.t('sessions.storyBestLap')}
                          totalLapsLabel={i18n.t('sessions.storyTotalLaps')}
                          topSpeedLabel={i18n.t('sessions.storyTopSpeed')}
                          variant={variant}
                        />
                      </View>
                    ) : null}
                  </View>
                </View>
              )}
            />

            {/* Dot indicators */}
            <View className="flex-row justify-center gap-2 mt-4">
              {STORY_TEMPLATES.map((variant) => (
                <View
                  key={variant}
                  className={`rounded-full ${storyTemplate === variant ? 'bg-violet-400' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                  style={{ width: 8, height: 8 }}
                />
              ))}
            </View>

            {/* Save to gallery */}
            <Pressable
              onPress={handleSaveToGallery}
              disabled={isSharing}
              className="flex-row items-center justify-center gap-2 mt-5 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 py-3.5 px-6"
            >
              <Ionicons name="download-outline" size={18} color={isDark ? '#ffffff' : '#18181b'} />
              <Text className="text-sm font-medium text-zinc-900 dark:text-white">
                {i18n.t('sessions.saveToGallery')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
    </KeyboardAvoidingView>
  );
}
