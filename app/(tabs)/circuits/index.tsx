import { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TextInput,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { FontAwesome6, Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import * as Location from "expo-location";
import { useT, type TranslateFn } from "@/hooks/useT";
import type { TrackListItem } from "@/db";
import { listTracks, listRecentTracks, setTrackFavorite } from "@/db";
import { haversineDistanceMeters } from "@/utils/geo";
import { filterAndRankTracks } from "@/utils/trackSearch";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useHeaderGradient } from "@/hooks/useHeaderGradient";
import { useMenu } from "@/contexts/MenuContext";
import { localizeTrack } from "@/utils/track-localization";
import CircuitCard from "@/components/circuits/CircuitCard";
import CircuitRequestModal from "@/components/circuits/CircuitRequestModal";

type ListMode = "all" | "favorites" | "recent" | "nearby";

const MODES: { key: ListMode; labelKey: string }[] = [
  { key: "all", labelKey: "circuits.all" },
  { key: "favorites", labelKey: "circuits.favorites" },
  { key: "recent", labelKey: "circuits.recent" },
  { key: "nearby", labelKey: "circuits.nearby" },
];

type LocationStatus = "idle" | "loading" | "denied" | "ready";

function countryFlag(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (letter) =>
      String.fromCodePoint(127397 + letter.charCodeAt(0)),
    );
}

function countryName(code: string, t: TranslateFn): string {
  return t(`countries.${code}`, { defaultValue: code });
}

export default function CircuitsScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();
  const [mode, setMode] = useState<ListMode>("all");
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [sortAscending, setSortAscending] = useState(true);
  const [search, setSearch] = useState("");
  const [circuits, setCircuits] = useState<TrackListItem[]>([]);
  const [recentCircuits, setRecentCircuits] = useState<TrackListItem[]>([]);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [position, setPosition] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [circuitsErrorKey, setCircuitsErrorKey] = useState<string | null>(null);
  // The key is stored, not the message: a translated string held in
  // state would not follow a language change, and making the effect
  // that sets it depend on the translator would re-run a data load.
  const circuitsError = circuitsErrorKey ? t(circuitsErrorKey) : null;
  const [recentErrorKey, setRecentErrorKey] = useState<string | null>(null);
  // The key is stored, not the message: a translated string held in
  // state would not follow a language change, and making the effect
  // that sets it depend on the translator would re-run a data load.
  const recentError = recentErrorKey ? t(recentErrorKey) : null;
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [requestCircuitName, setRequestCircuitName] = useState("");
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const gradientColors = useHeaderGradient("sky");
  const { openMenu, locale } = useMenu();

  // Every focus-effect run starts a new refresh generation; a completion from
  // an older generation may not touch state, so a request left over from a
  // previous mode cannot apply data or an error to the current one.
  const refreshGenerationRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);

  // Each source owns its error slot, so concurrent refreshes cannot erase one
  // another's failures. Success always clears the owner's slot, so a transient
  // failure cannot outlive the retry that recovered from it; quiet refreshes
  // leave an existing error in place rather than surfacing new ones over
  // stale-but-usable data.
  const refreshCircuits = useCallback(
    async (generation: number, surfaceError: boolean) => {
      try {
        const tracks = await listTracks(db);

        if (generation !== refreshGenerationRef.current) {
          return;
        }

        setCircuits(tracks);
        setCircuitsErrorKey(null);
      } catch {
        if (generation !== refreshGenerationRef.current) {
          return;
        }

        if (surfaceError) {
          setCircuitsErrorKey("circuits.loadError");
        }
      }
    },
    [db],
  );

  const refreshRecentCircuits = useCallback(
    async (generation: number, surfaceError: boolean) => {
      try {
        const tracks = await listRecentTracks(db);

        if (generation !== refreshGenerationRef.current) {
          return;
        }

        setRecentCircuits(tracks);
        setRecentErrorKey(null);
      } catch {
        if (generation !== refreshGenerationRef.current) {
          return;
        }

        if (surfaceError) {
          setRecentErrorKey("circuits.loadError");
        }
      }
    },
    [db],
  );

  // Each request bumps the generation and only the newest may write state, so
  // a re-render cannot cancel its own request the way an effect cleanup would,
  // and every switch to Nearby refreshes the fix instead of trusting an old one.
  const locationGenerationRef = useRef(0);

  const requestLocation = useCallback(async () => {
    const generation = ++locationGenerationRef.current;

    setLocationStatus("loading");
    setPosition(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (generation !== locationGenerationRef.current) {
        return;
      }

      if (!permission.granted) {
        setLocationStatus("denied");
        return;
      }

      const fix =
        (await Location.getLastKnownPositionAsync({ maxAge: 60_000 })) ??
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }));

      if (generation !== locationGenerationRef.current) {
        return;
      }

      setPosition({
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
      });
      setLocationStatus("ready");
    } catch {
      if (generation === locationGenerationRef.current) {
        setLocationStatus("denied");
      }
    }
  }, []);

  // The single owner of the refresh lifecycle: it runs on first mount, on
  // every mode change while focused, and whenever the screen regains focus
  // (favorites can change on the detail screen). One owner means no duplicate
  // requests to race each other; the generation stamps out the stragglers.
  useFocusEffect(
    useCallback(() => {
      const generation = ++refreshGenerationRef.current;
      const isFirstLoad = !hasLoadedOnceRef.current;

      hasLoadedOnceRef.current = true;

      if (isFirstLoad) {
        setIsLoading(true);
      }

      void refreshCircuits(generation, isFirstLoad).finally(() => {
        if (isFirstLoad) {
          setIsLoading(false);
        }
      });

      if (mode === "recent") {
        void refreshRecentCircuits(generation, true);
      }

      if (mode === "nearby") {
        void requestLocation();
      }
    }, [mode, refreshCircuits, refreshRecentCircuits, requestLocation]),
  );

  const countryOptions = useMemo(() => {
    const codes = new Set<string>();

    for (const circuit of circuits) {
      if (circuit.countryCode) {
        codes.add(circuit.countryCode);
      }
    }

    return [...codes].sort((a, b) =>
      countryName(a, t).localeCompare(countryName(b, t), locale),
    );
  }, [circuits, locale, t]);

  const distances = useMemo(() => {
    if (!position) {
      return null;
    }

    const byId = new Map<string, number>();

    for (const circuit of circuits) {
      if (circuit.centerLatitude !== null && circuit.centerLongitude !== null) {
        byId.set(
          circuit.id,
          haversineDistanceMeters(
            position.latitude,
            position.longitude,
            circuit.centerLatitude,
            circuit.centerLongitude,
          ),
        );
      }
    }

    return byId;
  }, [circuits, position]);

  const visibleCircuits = useMemo<TrackListItem[]>(() => {
    const base = mode === "recent" ? recentCircuits : circuits;
    const scoped = countryCode
      ? base.filter((circuit) => circuit.countryCode === countryCode)
      : base;

    const listed =
      mode === "favorites"
        ? scoped.filter((circuit) => circuit.isFavorite)
        : scoped;

    let ordered: TrackListItem[];

    if (mode === "nearby") {
      // Without a usable position there are no distances; fall back to the
      // promised name order instead of whatever order the base list carries.
      ordered = distances
        ? [...listed].sort((a, b) => {
            const distanceA = distances.get(a.id) ?? Number.POSITIVE_INFINITY;
            const distanceB = distances.get(b.id) ?? Number.POSITIVE_INFINITY;

            return distanceA - distanceB;
          })
        : [...listed].sort((a, b) =>
            localizeTrack(a, locale).name.localeCompare(
              localizeTrack(b, locale).name,
              locale,
            ),
          );
    } else if (mode === "recent") {
      ordered = listed;
    } else {
      ordered = [...listed].sort(
        (a, b) =>
          localizeTrack(a, locale).name.localeCompare(
            localizeTrack(b, locale).name,
            locale,
          ) * (sortAscending ? 1 : -1),
      );
    }

    // Ranking is stable, so within a rank the mode's own order survives.
    return search.trim()
      ? filterAndRankTracks(ordered, search, locale)
      : ordered;
  }, [
    circuits,
    recentCircuits,
    mode,
    countryCode,
    search,
    locale,
    distances,
    sortAscending,
  ]);

  const loadError = mode === "recent" ? recentError : circuitsError;
  const isEmpty = !isLoading && !loadError && visibleCircuits.length === 0;

  const handleToggleFavorite = useCallback(
    async (trackId: string) => {
      const current =
        circuits.find((circuit) => circuit.id === trackId)?.isFavorite ?? false;
      const next = !current;

      try {
        await setTrackFavorite(db, trackId, next);
      } catch {
        return;
      }

      const apply = (list: TrackListItem[]) =>
        list.map((circuit) =>
          circuit.id === trackId ? { ...circuit, isFavorite: next } : circuit,
        );

      setCircuits(apply);
      setRecentCircuits(apply);
    },
    [circuits, db],
  );

  const handlePressTrack = useCallback(
    (trackId: string) => {
      router.push({
        pathname: "/(tabs)/circuits/detail",
        params: { id: trackId },
      });
    },
    [router],
  );

  function openCircuitRequest(circuitName = "") {
    setRequestCircuitName(circuitName.trim());
    setIsRequestOpen(true);
  }

  function pillClassName(isActive: boolean) {
    return `rounded-full px-3 py-1.5 border ${
      isActive
        ? "bg-sky-500 border-sky-400"
        : "bg-zinc-200 dark:bg-white/10 border-zinc-200 dark:border-white/10"
    }`;
  }

  function pillTextClassName(isActive: boolean) {
    return `text-sm ${isActive ? "text-black" : "text-zinc-600 dark:text-zinc-300"}`;
  }

  const listHeader = (
    <LinearGradient
      colors={gradientColors}
      locations={[0, 0.5, 1]}
      style={{
        paddingTop: insets.top + 20,
        paddingHorizontal: 20,
        paddingBottom: 16,
        marginBottom: 16,
      }}
    >
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center gap-3">
          <Pressable onPress={openMenu} hitSlop={8}>
            <Ionicons
              name="menu"
              size={22}
              color={isDark ? "#a1a1aa" : "#71717a"}
            />
          </Pressable>
          <Text className="text-xs text-zinc-500 dark:text-zinc-400">
            {t("circuits.header")}
          </Text>
        </View>
        <Text className="text-xs text-zinc-500 dark:text-zinc-400">
          {t("circuits.trackCount", { count: circuits.length })}
        </Text>
      </View>

      <View className="mb-5">
        <Text className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">
          {t("circuits.subtitle")}
        </Text>
        <Text className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
          {t("circuits.title")}
        </Text>
      </View>

      <Pressable
        onPress={() => openCircuitRequest()}
        className="mb-3 self-end h-10 flex-row items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4"
      >
        <Ionicons name="add-circle-outline" size={18} color="#0ea5e9" />
        <Text className="text-sm font-semibold text-sky-600 dark:text-sky-400">
          {t("circuits.requestCircuit")}
        </Text>
      </Pressable>

      <View className="rounded-3xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10 p-3">
        <View className="flex-row items-center gap-3 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-4 py-3">
          <Ionicons
            name="search"
            size={16}
            color={isDark ? "#a1a1aa" : "#71717a"}
          />
          <TextInput
            style={{
              flex: 1,
              fontSize: 14,
              color: isDark ? "#fff" : "#18181b",
              padding: 0,
            }}
            placeholder={t("circuits.searchPlaceholder")}
            placeholderTextColor={isDark ? "#a1a1aa" : "#71717a"}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingTop: 12 }}
        >
          {MODES.map(({ key, labelKey }) => (
            <Pressable
              key={key}
              onPress={() => setMode(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === key }}
              className={pillClassName(mode === key)}
            >
              <Text className={pillTextClassName(mode === key)}>
                {t(labelKey)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {mode === "nearby" && locationStatus === "loading" ? (
          <Text className="pt-2 text-xs text-zinc-500 dark:text-zinc-400">
            {t("circuits.locatingYou")}
          </Text>
        ) : null}
        {mode === "nearby" && locationStatus === "denied" ? (
          <Text className="pt-2 text-xs text-zinc-500 dark:text-zinc-400">
            {t("circuits.locationUnavailable")}
          </Text>
        ) : null}
      </View>

      <View className="mt-3 flex-row items-start gap-2">
      <View className="self-start rounded-2xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10 overflow-hidden">
        <Pressable
          onPress={() => setIsCountryOpen((open) => !open)}
          className="flex-row items-center gap-2 px-4 py-3"
        >
          <Ionicons
            name="filter"
            size={14}
            color={isDark ? "#a1a1aa" : "#71717a"}
          />
          <Text className="text-sm font-medium text-zinc-900 dark:text-white">
            {countryCode
              ? `${countryFlag(countryCode)} ${countryName(countryCode, t)}`
              : t("circuits.allCountries")}
          </Text>
          <Ionicons
            name={isCountryOpen ? "chevron-up" : "chevron-down"}
            size={14}
            color={isDark ? "#52525b" : "#a1a1aa"}
          />
        </Pressable>

        {isCountryOpen ? (
          <View className="border-t border-zinc-100 dark:border-white/5" style={{ minWidth: 220 }}>
            <Pressable
              onPress={() => {
                setCountryCode(null);
                setIsCountryOpen(false);
              }}
              className={`flex-row items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-white/5 ${
                countryCode === null ? "bg-sky-500/10" : ""
              }`}
            >
              <Text
                className={`text-[15px] ${
                  countryCode === null
                    ? "font-medium text-sky-500"
                    : "text-zinc-900 dark:text-white"
                }`}
              >
                {t("circuits.allCountries")}
              </Text>
              {countryCode === null ? (
                <Ionicons name="checkmark" size={16} color="#0ea5e9" />
              ) : null}
            </Pressable>
            {countryOptions.map((code) => {
              const isSelected = countryCode === code;

              return (
                <Pressable
                  key={code}
                  onPress={() => {
                    setCountryCode(code);
                    setIsCountryOpen(false);
                  }}
                  className={`flex-row items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-white/5 ${
                    isSelected ? "bg-sky-500/10" : ""
                  }`}
                >
                  <View className="flex-row items-center gap-3">
                    <Text className="text-base">{countryFlag(code)}</Text>
                    <Text
                      className={`text-[15px] ${
                        isSelected
                          ? "font-medium text-sky-500"
                          : "text-zinc-900 dark:text-white"
                      }`}
                    >
                      {countryName(code, t)}
                    </Text>
                  </View>
                  {isSelected ? (
                    <Ionicons name="checkmark" size={16} color="#0ea5e9" />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {mode === "all" || mode === "favorites" ? (
        <Pressable
          onPress={() => setSortAscending((ascending) => !ascending)}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t("circuits.sortOrder")}
          accessibilityValue={{ text: sortAscending ? "A → Z" : "Z → A" }}
          className="items-center justify-center rounded-2xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10 p-3"
        >
          <FontAwesome6
            name={sortAscending ? "arrow-down-a-z" : "arrow-up-a-z"}
            size={15}
            color={isDark ? "#e4e4e7" : "#18181b"}
          />
        </Pressable>
      ) : null}
      </View>
    </LinearGradient>
  );

  return (
    <View className="flex-1 bg-zinc-50 dark:bg-zinc-900 overflow-hidden">
      <FlatList
        data={visibleCircuits}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => (
          <View className="px-5 pb-3">
            <CircuitCard
              circuit={item}
              locale={locale}
              isDark={isDark}
              distanceMeters={
                mode === "nearby" ? (distances?.get(item.id) ?? null) : null
              }
              onPress={handlePressTrack}
              onToggleFavorite={handleToggleFavorite}
            />
          </View>
        )}
        ListEmptyComponent={
          <View className="px-5">
            {isLoading ? (
              <View className="rounded-3xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-4">
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                  {t("circuits.loadingTracks")}
                </Text>
              </View>
            ) : loadError ? (
              <View className="rounded-3xl bg-red-500/10 border border-red-500/20 p-4">
                <Text className="text-sm text-red-700 dark:text-red-200">
                  {loadError}
                </Text>
              </View>
            ) : null}
          </View>
        }
        ListFooterComponent={
          isEmpty ? (
            <View className="px-5">
              <View className="rounded-3xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-4">
                <Text className="text-sm font-medium text-zinc-900 dark:text-white">
                  {t("circuits.noTracksFound")}
                </Text>
                <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {t("circuits.noTracksFoundHint")}
                </Text>
                {search.trim() ? (
                  <Pressable
                    onPress={() => openCircuitRequest(search)}
                    className="mt-4 h-10 flex-row items-center justify-center gap-2 rounded-xl bg-sky-500"
                  >
                    <Ionicons
                      name="paper-plane-outline"
                      size={16}
                      color="#ffffff"
                    />
                    <Text className="text-sm font-semibold text-white">
                      {t("circuits.requestSearch", { name: search.trim() })}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null
        }
      />
      <CircuitRequestModal
        visible={isRequestOpen}
        initialCircuitName={requestCircuitName}
        onClose={() => setIsRequestOpen(false)}
      />
    </View>
  );
}
