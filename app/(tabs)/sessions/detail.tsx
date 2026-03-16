import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import MapView, { Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import i18n from '@/i18n';
import StatusPill from '@/components/StatusPill';
import Card from '@/components/Card';
import LapBreakdown from '@/components/LapBreakdown';
import type { LapBreakdownItem } from '@/components/LapBreakdown';
import ProgressBar from '@/components/ProgressBar';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useHeaderGradient } from '@/hooks/useHeaderGradient';

// Mock data — will be replaced when wired to real session data
const MOCK_MAP_REGION = {
  latitude: 36.3686,
  longitude: 140.2268,
  latitudeDelta: 0.003,
  longitudeDelta: 0.00375,
};

const MOCK_START_FINISH = [
  { latitude: 36.36955, longitude: 140.22683 },
  { latitude: 36.36938, longitude: 140.22695 },
];

const MOCK_GPS_LINE = [
  { latitude: 36.3696, longitude: 140.2269 },
  { latitude: 36.3698, longitude: 140.2264 },
  { latitude: 36.3701, longitude: 140.2258 },
  { latitude: 36.3699, longitude: 140.2250 },
  { latitude: 36.3693, longitude: 140.2245 },
  { latitude: 36.3686, longitude: 140.2248 },
  { latitude: 36.3680, longitude: 140.2255 },
  { latitude: 36.3677, longitude: 140.2265 },
  { latitude: 36.3680, longitude: 140.2275 },
  { latitude: 36.3686, longitude: 140.2282 },
  { latitude: 36.3692, longitude: 140.2278 },
  { latitude: 36.3696, longitude: 140.2269 },
];

const MOCK_LAPS: LapBreakdownItem[] = [
  { lap: 1, time: '1:54.238', timeMs: 114238, delta: '+5.467', sectors: ['32.184', '43.102', '38.952'], sectorMs: [32184, 43102, 38952] },
  { lap: 2, time: '1:49.914', timeMs: 109914, delta: '+1.143', sectors: ['31.902', '41.890', '36.122'], sectorMs: [31902, 41890, 36122] },
  { lap: 3, time: '1:48.771', timeMs: 108771, delta: null, sectors: ['31.842', '41.317', '35.612'], sectorMs: [31842, 41317, 35612] },
  { lap: 4, time: '1:49.102', timeMs: 109102, delta: '+0.331', sectors: ['32.011', '41.580', '35.511'], sectorMs: [32011, 41580, 35511] },
];

type Note = { id: string; text: string };

const MOCK_NOTES: Note[] = [
  { id: '1', text: 'Braking too late into T3, losing time on exit' },
  { id: '2', text: 'Good traction out of the hairpin on lap 3' },
];

export default function SessionDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const gradientColors = useHeaderGradient('violet');
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [notes, setNotes] = useState<Note[]>(MOCK_NOTES);
  const [isEditing, setIsEditing] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  function handleAddNote() {
    const text = newNote.trim();
    if (!text) return;
    setNotes([...notes, { id: `${Date.now()}`, text }]);
    setNewNote('');
  }

  function handleUpdateNote(noteId: string) {
    const text = editingNoteText.trim();
    if (!text) return;
    setNotes(notes.map((n) => (n.id === noteId ? { ...n, text } : n)));
    setEditingNoteId(null);
    setEditingNoteText('');
  }

  function handleDeleteNote(noteId: string) {
    setNotes(notes.filter((n) => n.id !== noteId));
  }

  function startEditingNote(note: Note) {
    setEditingNoteId(note.id);
    setEditingNoteText(note.text);
  }

  function cancelEditingNote() {
    setEditingNoteId(null);
    setEditingNoteText('');
  }

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
          <View className="flex-row items-center justify-between mb-4">
            <Pressable onPress={() => router.back()}>
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('common.back')}</Text>
            </Pressable>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">Fuji Speedway</Text>
          </View>

          {/* Title + status */}
          <View className="flex-row items-start justify-between mb-5">
            <View className="flex-1 mr-3">
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.recordedSession')}</Text>
              <Text className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Track Day · Session 2</Text>
              <Text className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Mar 10, 2026 · 10:24 AM</Text>
            </View>
            <StatusPill text={i18n.t('sessions.bestRun')} color="violet" />
          </View>

          {/* Track map card */}
          <View className="rounded-3xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10 p-4">
            <View className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-zinc-200 dark:bg-zinc-950/80 mb-3 h-80 overflow-hidden">
              <MapView
                initialRegion={MOCK_MAP_REGION}
                mapType="satellite"
                rotateEnabled={true}
                pitchEnabled={true}
                toolbarEnabled={false}
                style={{ flex: 1 }}
              >
                <Polyline
                  coordinates={MOCK_GPS_LINE}
                  strokeColor="#a78bfa"
                  strokeWidth={3}
                />
                <Polyline
                  coordinates={MOCK_START_FINISH}
                  strokeColor="#ef4444"
                  strokeWidth={4}
                />
              </MapView>
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
          {/* Best Lap */}
          <View className="rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-4">
            <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{i18n.t('session.bestLap')}</Text>
            <Text
              className="text-zinc-900 dark:text-white text-center"
              style={{ fontSize: 40, lineHeight: 44, fontWeight: '600', fontVariant: ['tabular-nums'] }}
            >
              1:48.771
            </Text>
          </View>

          {/* Metrics row */}
          <View className="flex-row gap-3">
            {[
              { label: i18n.t('session.topSpeed'), value: '214 km/h' },
              { label: i18n.t('session.duration'), value: '18:42' },
              { label: i18n.t('session.totalLaps'), value: '12' },
            ].map((m) => (
              <View key={m.label} className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{m.label}</Text>
                <Text className="text-lg font-semibold text-zinc-900 dark:text-white">{m.value}</Text>
              </View>
            ))}
          </View>

          {/* Session Insights */}
          <Card>
            <View className="mb-4">
              <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('sessions.sessionInsights')}</Text>
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.performanceSummary')}</Text>
            </View>

            {/* Consistency */}
            <View className="mb-4">
              <ProgressBar label={i18n.t('postSession.consistency')} value="91%" color="bg-white dark:bg-white" />
            </View>

            {/* Theoretical Best */}
            <View className="mb-4">
              <View className="flex-row justify-between mb-1">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.theoreticalBest')}</Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">1:47.670</Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="flex-1 h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
                  <View className="h-full rounded-full bg-violet-400" style={{ width: '96%' }} />
                </View>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.gap', { gap: '1.101' })}</Text>
              </View>
              <Text className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{i18n.t('sessions.bestSectorsCombined')}</Text>
            </View>

            {/* Lap Delta Trend */}
            <View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.lapDeltaTrend')}</Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.avgPerLap', { delta: '−0.8s' })}</Text>
              </View>
              <View className="flex-row gap-1.5 items-end h-16">
                {[
                  { lap: 1, height: 85, best: false },
                  { lap: 2, height: 65, best: false },
                  { lap: 3, height: 100, best: true },
                  { lap: 4, height: 70, best: false },
                ].map((bar) => (
                  <View key={bar.lap} className="flex-1 items-center">
                    <View
                      className={`w-full rounded-md ${bar.best ? 'bg-violet-400' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                      style={{ height: `${bar.height}%` }}
                    />
                  </View>
                ))}
              </View>
              <View className="flex-row justify-between mt-1">
                <Text className="text-xs text-zinc-400 dark:text-zinc-500">{i18n.t('sessions.lapLabel', { number: 1 })}</Text>
                <Text className="text-xs text-zinc-400 dark:text-zinc-500">{i18n.t('sessions.lapLabel', { number: 4 })}</Text>
              </View>
            </View>
          </Card>

          {/* Lap Breakdown */}
          <LapBreakdown laps={MOCK_LAPS} accentColor="violet" />

          {/* Session Notes */}
          <Card>
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('sessions.sessionNotes')}</Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{i18n.t('sessions.sessionNotesSubtitle')}</Text>
              </View>
              <Pressable
                onPress={() => { setIsEditing(!isEditing); cancelEditingNote(); setNewNote(''); }}
                className="rounded-full px-4 py-2"
                hitSlop={8}
              >
                <Text className="text-sm font-medium text-violet-400">
                  {isEditing ? i18n.t('common.done') : i18n.t('common.edit')}
                </Text>
              </Pressable>
            </View>
            <View className="gap-2">
              {notes.length ? (
                notes.map((note) => (
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
                          <Text className="text-sm text-zinc-700 dark:text-zinc-200 leading-5">{note.text}</Text>
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

        {/* Bottom buttons */}
        <View className="px-5 pb-5 pt-1 flex-row gap-3">
          <Pressable className="flex-1 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 py-3.5 items-center">
            <Text className="text-sm font-medium text-zinc-900 dark:text-white">{i18n.t('sessions.exportData')}</Text>
          </Pressable>
          <Pressable className="flex-1 rounded-2xl bg-violet-500 py-3.5 items-center">
            <Text className="text-sm font-semibold text-white">{i18n.t('sessions.share')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
