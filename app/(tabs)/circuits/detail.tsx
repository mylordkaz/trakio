import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Polyline } from "react-native-maps";
import i18n from "@/i18n";
import StatusPill from "@/components/StatusPill";
import Card from "@/components/Card";
import type { TrackDetail, TrackNoteRow } from "@/db";
import {
  getTrackById,
  addTrackNote,
  updateTrackNote,
  deleteTrackNote,
} from "@/db";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useHeaderGradient } from "@/hooks/useHeaderGradient";

function formatTrackLength(lengthMeters: number | null) {
  if (lengthMeters === null) {
    return i18n.t("common.tbd");
  }

  return `${(lengthMeters / 1000).toFixed(3)} km`;
}

function formatDirection(direction: TrackDetail["direction"]) {
  if (!direction) {
    return i18n.t("common.tbd");
  }

  return direction === "clockwise"
    ? i18n.t("circuits.clockwise")
    : i18n.t("circuits.counterclockwise");
}

function getMapLatitudeDelta(lengthMeters: number | null) {
  if (!lengthMeters) {
    return 0.0035;
  }

  return Math.min(Math.max(lengthMeters / 450000, 0.0015), 0.0055);
}

export default function CircuitDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [circuit, setCircuit] = useState<TrackDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const scrollRef = useRef<ScrollView>(null);
  const gradientColors = useHeaderGradient("sky");

  const loadCircuit = useCallback(async () => {
    if (!id) {
      setLoadError(i18n.t("circuits.trackNotFound"));
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const nextCircuit = await getTrackById(db, id);

      if (!nextCircuit) {
        setLoadError(i18n.t("circuits.trackNotFound"));
        setCircuit(null);
        return;
      }

      setCircuit(nextCircuit);
      setLoadError(null);
    } catch {
      setLoadError(i18n.t("circuits.unableToLoadTrack"));
    } finally {
      setIsLoading(false);
    }
  }, [db, id]);

  useEffect(() => {
    let isMounted = true;

    void loadCircuit().then(() => {
      if (!isMounted) return;
    });

    return () => {
      isMounted = false;
    };
  }, [loadCircuit]);

  async function handleAddNote() {
    const text = newNote.trim();
    if (!text || !circuit) return;

    const note = await addTrackNote(db, circuit.id, text);
    setCircuit({ ...circuit, notes: [...circuit.notes, note] });
    setNewNote("");
  }

  async function handleUpdateNote(noteId: string) {
    const text = editingNoteText.trim();
    if (!text || !circuit) return;

    await updateTrackNote(db, noteId, text);
    setCircuit({
      ...circuit,
      notes: circuit.notes.map((n) =>
        n.id === noteId ? { ...n, note: text } : n,
      ),
    });
    setEditingNoteId(null);
    setEditingNoteText("");
  }

  async function handleDeleteNote(noteId: string) {
    if (!circuit) return;

    await deleteTrackNote(db, noteId);
    setCircuit({
      ...circuit,
      notes: circuit.notes.filter((n) => n.id !== noteId),
    });
  }

  function startEditingNote(note: TrackNoteRow) {
    setEditingNoteId(note.id);
    setEditingNoteText(note.note);
  }

  function cancelEditingNote() {
    setEditingNoteId(null);
    setEditingNoteText("");
  }

  const personalBest = circuit?.personalBest ?? null;
  const sectorCount = circuit?.sectorCount ?? 0;
  const startFinishLine =
    circuit?.timingLines.find(
      (timingLine) => timingLine.type === "start_finish",
    ) ?? null;
  const sectorLines =
    circuit?.timingLines.filter((timingLine) => timingLine.type === "sector") ??
    [];
  const mapLatitudeDelta = getMapLatitudeDelta(circuit?.lengthMeters ?? null);
  const mapRegion =
    circuit?.centerLatitude && circuit?.centerLongitude
      ? {
          latitude: circuit.centerLatitude,
          longitude: circuit.centerLongitude,
          latitudeDelta: mapLatitudeDelta,
          longitudeDelta: mapLatitudeDelta * 1.25,
        }
      : null;

  function formatLapTime(ms: number): string {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - minutes * 60;
    return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
  }

  function formatSectorTime(ms: number): string {
    return (ms / 1000).toFixed(3);
  }

  function formatSetOnDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(i18n.locale === "ja" ? "ja-JP" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
      style={{ backgroundColor: isDark ? "#18181b" : "#fafafa" }}
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
            {/* Header */}
            <View className="flex-row items-center justify-between mb-4">
              <Pressable onPress={() => router.back()}>
                <Text className="text-sm font-medium text-sky-400">
                  {i18n.t("common.back")}
                </Text>
              </Pressable>
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                {i18n.t("circuits.trackDetails")}
              </Text>
            </View>

            {/* Title + status */}
            <View className="flex-row items-start justify-between mb-5">
              <View className="flex-1 mr-3">
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                  {i18n.t("circuits.circuitProfile")}
                </Text>
                <Text className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                  {circuit?.name ?? i18n.t("common.track")}
                </Text>
                <Text className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                  {circuit
                    ? [circuit.location, circuit.country]
                        .filter(Boolean)
                        .join(", ")
                    : isLoading
                      ? i18n.t("common.loading")
                      : i18n.t("common.track")}
                </Text>
              </View>
              <StatusPill
                text={circuit?.layoutName ?? i18n.t("common.track")}
                color="sky"
              />
            </View>

            {/* Track layout card */}
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
                    {sectorLines.map((sectorLine) => (
                      <Polyline
                        key={sectorLine.id}
                        coordinates={[sectorLine.a, sectorLine.b]}
                        strokeColor="#e5e7eb"
                        strokeWidth={2}
                      />
                    ))}
                    {startFinishLine ? (
                      <Polyline
                        coordinates={[startFinishLine.a, startFinishLine.b]}
                        strokeColor="#ef4444"
                        strokeWidth={3}
                      />
                    ) : null}
                  </MapView>
                ) : (
                  <View className="flex-1 items-center justify-center p-5">
                    <Text className="text-zinc-400 dark:text-zinc-500 text-sm">
                      {i18n.t("circuits.trackMap")}
                    </Text>
                  </View>
                )}
              </View>
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  <View className="flex-row items-center gap-1.5">
                    <View className="h-0.5 w-3 rounded-full bg-red-500" />
                    <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                      {i18n.t("circuits.startFinish")}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <View className="h-px w-3 rounded-full bg-zinc-200" />
                    <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                      {i18n.t("circuits.sectors")}
                    </Text>
                  </View>
                </View>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  {circuit
                    ? i18n.t("circuits.sectorsConfigured", {
                        count: circuit.sectorCount,
                      })
                    : i18n.t("circuits.loadingTimingLines")}
                </Text>
              </View>
            </View>
          </LinearGradient>

          <View className="px-5 py-4 gap-4">
            {loadError ? (
              <Card>
                <Text className="text-sm text-red-700 dark:text-red-200">
                  {loadError}
                </Text>
              </Card>
            ) : null}

            {isLoading ? (
              <Card>
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                  {i18n.t("circuits.loadingTrack")}
                </Text>
              </Card>
            ) : null}

            {/* Stats row */}
            <View className="flex-row gap-3">
              {[
                {
                  label: i18n.t("circuits.length"),
                  value: formatTrackLength(circuit?.lengthMeters ?? null),
                },
                {
                  label: i18n.t("circuits.corners"),
                  value: `${circuit?.corners ?? i18n.t("common.tbd")}`,
                },
                {
                  label: i18n.t("circuits.direction"),
                  value: formatDirection(circuit?.direction ?? null),
                },
              ].map((s) => (
                <View
                  key={s.label}
                  className="flex-1 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3"
                >
                  <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                    {s.label}
                  </Text>
                  <Text className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {s.value}
                  </Text>
                </View>
              ))}
            </View>

            {/* Personal Best */}
            <Card>
              <View className="flex-row items-center justify-between mb-3">
                <View>
                  <Text className="text-sm font-medium text-zinc-900 dark:text-white">
                    {i18n.t("circuits.personalBest")}
                  </Text>
                  <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                    {i18n.t("circuits.personalBestSubtitle")}
                  </Text>
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/sessions",
                      params: { trackId: circuit?.id ?? "", trackName: circuit?.name ?? "" },
                    })
                  }
                >
                  <Text className="text-sm font-medium text-sky-500">
                    {i18n.t("circuits.history")}
                  </Text>
                </Pressable>
              </View>

              {/* Best Lap time card */}
              <View className="rounded-2xl bg-zinc-50 dark:bg-black/20 border border-zinc-100 dark:border-white/5 p-4 mb-3">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1">
                    <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                      {i18n.t("session.bestLap")}
                    </Text>
                    <Text
                      className={
                        personalBest
                          ? "text-zinc-900 dark:text-white"
                          : "text-zinc-400 dark:text-zinc-600"
                      }
                      style={{
                        fontSize: 40,
                        lineHeight: 44,
                        fontWeight: "600",
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {personalBest
                        ? formatLapTime(personalBest.lapTimeMs)
                        : "--:--.---"}
                    </Text>
                  </View>
                  {personalBest ? (
                    <View className="items-end pt-1">
                      <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                        {i18n.t("circuits.setOn")}
                      </Text>
                      <Text className="text-sm font-medium text-zinc-900 dark:text-white">
                        {formatSetOnDate(personalBest.setOn)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Sector tiles */}
              {sectorCount > 0 ? (
                <>
                  <View className="flex-row gap-2 mb-2">
                    {Array.from({ length: sectorCount }, (_, i) => {
                      const sectorMs = personalBest?.sectors[i] ?? null;
                      return (
                        <View
                          key={i}
                          className="flex-1 rounded-2xl bg-zinc-50 dark:bg-black/20 border border-zinc-100 dark:border-white/5 p-3"
                        >
                          <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                            {i18n.t("circuits.sectorLabel", { number: i + 1 })}
                          </Text>
                          <Text
                            className={
                              sectorMs !== null
                                ? "text-zinc-900 dark:text-white"
                                : "text-zinc-400 dark:text-zinc-600"
                            }
                            style={{
                              fontSize: 18,
                              fontWeight: "500",
                              fontVariant: ["tabular-nums"],
                            }}
                          >
                            {sectorMs !== null
                              ? formatSectorTime(sectorMs)
                              : "---.---"}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                  <Text className="text-xs text-zinc-400 dark:text-zinc-500 text-center">
                    {i18n.t("circuits.gpsApproximatedSplits")}
                  </Text>
                </>
              ) : null}
            </Card>

            {/* Driver Notes */}
            <Card>
              <View className="flex-row items-center justify-between mb-3">
                <View>
                  <Text className="text-sm font-medium text-zinc-900 dark:text-white">
                    {i18n.t("circuits.driverNotes")}
                  </Text>
                  <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                    {i18n.t("circuits.driverNotesSubtitle")}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setIsEditing(!isEditing);
                    cancelEditingNote();
                    setNewNote("");
                  }}
                  className="rounded-full px-4 py-2"
                  hitSlop={8}
                >
                  <Text className="text-sm font-medium text-sky-500">
                    {isEditing ? i18n.t("common.done") : i18n.t("common.edit")}
                  </Text>
                </Pressable>
              </View>
              <View className="gap-2">
                {circuit?.notes.length ? (
                  circuit.notes.map((note) => (
                    <View key={note.id}>
                      {editingNoteId === note.id ? (
                        <View className="rounded-2xl bg-zinc-50 dark:bg-black/20 border border-sky-400/40 p-4">
                          <TextInput
                            style={{
                              color: isDark ? "#e4e4e7" : "#3f3f46",
                              fontSize: 15,
                              padding: 0,
                              minHeight: 48,
                            }}
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
                              <Text className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                                {i18n.t("common.cancel")}
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleUpdateNote(note.id)}
                              className="rounded-xl px-5 py-2.5 bg-sky-500"
                              hitSlop={4}
                            >
                              <Text className="text-sm font-medium text-white">
                                {i18n.t("common.save")}
                              </Text>
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
                              <Ionicons
                                name="remove-circle"
                                size={22}
                                color="#ef4444"
                              />
                            </Pressable>
                          ) : null}
                          <Pressable
                            onPress={
                              isEditing
                                ? () => startEditingNote(note)
                                : undefined
                            }
                            disabled={!isEditing}
                            className="flex-1 rounded-2xl bg-zinc-50 dark:bg-black/20 px-4 py-3 border border-zinc-100 dark:border-white/5"
                          >
                            <Text className="text-sm text-zinc-700 dark:text-zinc-200 leading-5">
                              {note.note}
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  ))
                ) : !isEditing ? (
                  <View className="rounded-2xl bg-zinc-50 dark:bg-black/20 px-4 py-3 border border-zinc-100 dark:border-white/5">
                    <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                      {i18n.t("circuits.noDriverNotesYet")}
                    </Text>
                  </View>
                ) : null}

                {isEditing ? (
                  <View className="rounded-2xl bg-zinc-50 dark:bg-black/20 border border-dashed border-zinc-300 dark:border-white/10 p-4">
                    <TextInput
                      style={{
                        color: isDark ? "#e4e4e7" : "#3f3f46",
                        fontSize: 15,
                        padding: 0,
                        minHeight: 44,
                      }}
                      placeholder={i18n.t("circuits.addNotePlaceholder")}
                      placeholderTextColor={isDark ? "#71717a" : "#a1a1aa"}
                      value={newNote}
                      onChangeText={setNewNote}
                      onFocus={() =>
                        setTimeout(
                          () =>
                            scrollRef.current?.scrollToEnd({ animated: true }),
                          300,
                        )
                      }
                      multiline
                    />
                    {newNote.trim().length > 0 ? (
                      <Pressable
                        onPress={handleAddNote}
                        className="mt-3 self-end rounded-xl px-5 py-2.5 bg-sky-500"
                        hitSlop={4}
                      >
                        <Text className="text-sm font-medium text-white">
                          {i18n.t("circuits.addNote")}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </Card>
          </View>

          {/* Bottom buttons */}
          <View className="px-5 pb-5 pt-1 flex-row gap-3">
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/sessions",
                  params: { trackId: circuit?.id ?? "", trackName: circuit?.name ?? "" },
                })
              }
              className="flex-1 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 py-3.5 items-center"
            >
              <Text className="text-sm font-medium text-zinc-900 dark:text-white">
                {i18n.t("circuits.viewHistory")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: "/(tabs)/record", params: { trackId: circuit?.id } })}
              className="flex-1 rounded-2xl bg-sky-500 py-3.5 items-center"
            >
              <Text className="text-sm font-semibold text-black">
                {i18n.t("session.start")}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
