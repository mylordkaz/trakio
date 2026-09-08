import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, TextInput, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { FontAwesome6, Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import * as Location from "expo-location";
import i18n from "@/i18n";
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

function countryName(code: string): string {
  return i18n.t(`countries.${code}`, { defaultValue: code });
}

export default function CircuitsScreen() {
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [requestCircuitName, setRequestCircuitName] = useState("");
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const gradientColors = useHeaderGradient("sky");
  const { openMenu, locale } = useMenu();

  useEffect(() => {
    let isMounted = true;

    async function loadCircuits() {
      try {
        setIsLoading(true);
        const nextCircuits = await listTracks(db);

        if (!isMounted) {
          return;
        }

        setCircuits(nextCircuits);
        setLoadError(null);
      } catch {
        if (!isMounted) {
          return;
        }

        setLoadError(i18n.t("circuits.loadError"));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadCircuits();

    return () => {
      isMounted = false;
    };
  }, [db]);

  // Favorites can change on the detail screen; refresh silently on focus so
  // returning to the list reflects them without a loading state.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      void listTracks(db)
        .then((tracks) => {
          if (active) {
            setCircuits(tracks);
          }
        })
        .catch(() => undefined);

      if (mode === "recent") {
        void listRecentTracks(db)
          .then((tracks) => {
            if (active) {
              setRecentCircuits(tracks);
            }
          })
          .catch(() => undefined);
      }

      return () => {
        active = false;
      };
    }, [db, mode]),
  );

  useEffect(() => {
    if (mode !== "recent") {
      return;
    }

    let isMounted = true;

    listRecentTracks(db)
      .then((tracks) => {
        if (isMounted) {
          setRecentCircuits(tracks);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoadError(i18n.t("circuits.loadError"));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [db, mode]);

  useEffect(() => {
    if (mode !== "nearby" || locationStatus !== "idle") {
      return;
    }

    let isMounted = true;

    async function locate() {
      setLocationStatus("loading");

      try {
        const permission = await Location.requestForegroundPermissionsAsync();

        if (!permission.granted) {
          if (isMounted) {
            setLocationStatus("denied");
          }
          return;
        }

        const fix =
          (await Location.getLastKnownPositionAsync()) ??
          (await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }));

        if (!isMounted) {
          return;
        }

        setPosition({
          latitude: fix.coords.latitude,
          longitude: fix.coords.longitude,
        });
        setLocationStatus("ready");
      } catch {
        if (isMounted) {
          setLocationStatus("denied");
        }
      }
    }

    void locate();

    return () => {
      isMounted = false;
    };
  }, [mode, locationStatus]);

  const countryOptions = useMemo(() => {
    const codes = new Set<string>();

    for (const circuit of circuits) {
      if (circuit.countryCode) {
        codes.add(circuit.countryCode);
      }
    }

    return [...codes].sort((a, b) =>
      countryName(a).localeCompare(countryName(b), locale),
    );
  }, [circuits, locale]);

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

    if (search.trim()) {
      return filterAndRankTracks(scoped, search, locale);
    }

    if (mode === "nearby") {
      return [...scoped].sort((a, b) => {
        const distanceA = distances?.get(a.id) ?? Number.POSITIVE_INFINITY;
        const distanceB = distances?.get(b.id) ?? Number.POSITIVE_INFINITY;

        return distanceA - distanceB;
      });
    }

    if (mode === "recent") {
      return scoped;
    }

    const listed =
      mode === "favorites"
        ? scoped.filter((circuit) => circuit.isFavorite)
        : scoped;

    return [...listed].sort(
      (a, b) =>
        localizeTrack(a, locale).name.localeCompare(
          localizeTrack(b, locale).name,
          locale,
        ) * (sortAscending ? 1 : -1),
    );
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
            {i18n.t("circuits.header")}
          </Text>
        </View>
        <Text className="text-xs text-zinc-500 dark:text-zinc-400">
          {i18n.t("circuits.trackCount", { count: circuits.length })}
        </Text>
      </View>

      <View className="mb-5">
        <Text className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">
          {i18n.t("circuits.subtitle")}
        </Text>
        <Text className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
          {i18n.t("circuits.title")}
        </Text>
      </View>

      <Pressable
        onPress={() => openCircuitRequest()}
        className="mb-3 self-end h-10 flex-row items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4"
      >
        <Ionicons name="add-circle-outline" size={18} color="#0ea5e9" />
        <Text className="text-sm font-semibold text-sky-600 dark:text-sky-400">
          {i18n.t("circuits.requestCircuit")}
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
            placeholder={i18n.t("circuits.searchPlaceholder")}
            placeholderTextColor={isDark ? "#a1a1aa" : "#71717a"}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <View className="flex-row gap-2 pt-3">
          {MODES.map(({ key, labelKey }) => (
            <Pressable
              key={key}
              onPress={() => setMode(key)}
              className={pillClassName(mode === key)}
            >
              <Text className={pillTextClassName(mode === key)}>
                {i18n.t(labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === "nearby" && locationStatus === "loading" ? (
          <Text className="pt-2 text-xs text-zinc-500 dark:text-zinc-400">
            {i18n.t("circuits.locatingYou")}
          </Text>
        ) : null}
        {mode === "nearby" && locationStatus === "denied" ? (
          <Text className="pt-2 text-xs text-zinc-500 dark:text-zinc-400">
            {i18n.t("circuits.locationUnavailable")}
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
              ? `${countryFlag(countryCode)} ${countryName(countryCode)}`
              : i18n.t("circuits.allCountries")}
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
                {i18n.t("circuits.allCountries")}
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
                      {countryName(code)}
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

      <Pressable
        onPress={() => setSortAscending((ascending) => !ascending)}
        hitSlop={4}
        className="items-center justify-center rounded-2xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10 p-3"
      >
        <FontAwesome6
          name={sortAscending ? "arrow-down-a-z" : "arrow-up-a-z"}
          size={15}
          color={isDark ? "#e4e4e7" : "#18181b"}
        />
      </Pressable>
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
                  {i18n.t("circuits.loadingTracks")}
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
                  {i18n.t("circuits.noTracksFound")}
                </Text>
                <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {i18n.t("circuits.noTracksFoundHint")}
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
                      {i18n.t("circuits.requestSearch", { name: search.trim() })}
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
