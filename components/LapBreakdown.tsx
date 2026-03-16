import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import i18n from '@/i18n';
import Card from '@/components/Card';

export type LapBreakdownItem = {
  lap: number;
  time: string;
  timeMs: number;
  delta: string | null;
  sectors: (string | null)[];
  sectorMs: (number | null)[];
};

type BestSectors = (number | null)[];

function getBestSectors(laps: LapBreakdownItem[]): BestSectors {
  const sectorCount = laps[0]?.sectors.length ?? 0;
  return Array.from({ length: sectorCount }, (_, i) => {
    const times = laps.map((l) => l.sectorMs[i]).filter((t): t is number => t !== null);
    return times.length > 0 ? Math.min(...times) : null;
  });
}

function formatDelta(a: number, b: number): string {
  const diff = a - b;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${(diff / 1000).toFixed(3)}`;
}

export default function LapBreakdown({
  laps,
  accentColor = 'violet',
}: {
  laps: LapBreakdownItem[];
  accentColor?: 'violet' | 'emerald' | 'sky';
}) {
  const [expandedLap, setExpandedLap] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedLaps, setSelectedLaps] = useState<number[]>([]);

  const bestSectors = getBestSectors(laps);

  const accentClasses = {
    violet: {
      text: 'text-violet-400',
      bg: 'bg-violet-500/10',
      border: 'border-violet-400/30',
      selectedBg: 'bg-violet-500/15',
      selectedBorder: 'border-violet-400/40',
      dot: 'bg-violet-500',
      dotRing: 'border-violet-400',
    },
    emerald: {
      text: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-400/30',
      selectedBg: 'bg-emerald-500/15',
      selectedBorder: 'border-emerald-400/40',
      dot: 'bg-emerald-500',
      dotRing: 'border-emerald-400',
    },
    sky: {
      text: 'text-sky-400',
      bg: 'bg-sky-500/10',
      border: 'border-sky-400/30',
      selectedBg: 'bg-sky-500/15',
      selectedBorder: 'border-sky-400/40',
      dot: 'bg-sky-500',
      dotRing: 'border-sky-400',
    },
  };

  const accent = accentClasses[accentColor];

  function handleRowPress(lapNumber: number) {
    if (compareMode) {
      setSelectedLaps((prev) => {
        if (prev.includes(lapNumber)) {
          return prev.filter((l) => l !== lapNumber);
        }
        if (prev.length >= 2) {
          return [prev[1], lapNumber];
        }
        return [...prev, lapNumber];
      });
    } else {
      setExpandedLap(expandedLap === lapNumber ? null : lapNumber);
    }
  }

  function enterCompare() {
    setCompareMode(true);
    setExpandedLap(null);
    setSelectedLaps([]);
  }

  function exitCompare() {
    setCompareMode(false);
    setSelectedLaps([]);
  }

  const compareA = compareMode && selectedLaps.length >= 1 ? laps.find((l) => l.lap === selectedLaps[0]) : null;
  const compareB = compareMode && selectedLaps.length >= 2 ? laps.find((l) => l.lap === selectedLaps[1]) : null;

  return (
    <Card>
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-sm font-medium text-zinc-900 dark:text-white">
          {i18n.t('postSession.lapBreakdown')}
        </Text>
        <Pressable onPress={compareMode ? exitCompare : enterCompare} hitSlop={8}>
          <Text className={`text-sm font-medium ${accent.text}`}>
            {compareMode ? i18n.t('common.done') : i18n.t('circuits.compare')}
          </Text>
        </Pressable>
      </View>

      {/* Compare hint */}
      {compareMode && selectedLaps.length < 2 ? (
        <Text className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">
          {selectedLaps.length === 0
            ? i18n.t('sessions.selectTwoLaps')
            : i18n.t('sessions.selectSecondLap')}
        </Text>
      ) : null}

      <View className="gap-2">
        {laps.map((lap) => {
          const isBest = lap.delta === null;
          const isExpanded = !compareMode && expandedLap === lap.lap;
          const isSelected = compareMode && selectedLaps.includes(lap.lap);

          return (
            <View key={lap.lap}>
              <Pressable
                onPress={() => handleRowPress(lap.lap)}
                className={`rounded-2xl px-4 py-3 border ${
                  isSelected
                    ? `${accent.selectedBg} ${accent.selectedBorder}`
                    : isBest
                      ? `${accent.bg} ${accent.border}`
                      : 'bg-zinc-50 dark:bg-black/20 border-zinc-100 dark:border-white/5'
                }`}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    {compareMode ? (
                      <View
                        className={`h-5 w-5 rounded-full border-2 items-center justify-center ${
                          isSelected ? accent.dotRing : 'border-zinc-400 dark:border-zinc-600'
                        }`}
                      >
                        {isSelected ? (
                          <View className={`h-2.5 w-2.5 rounded-full ${accent.dot}`} />
                        ) : null}
                      </View>
                    ) : null}
                    <View className="flex-row items-center gap-2">
                      <Text className="text-sm font-medium text-zinc-900 dark:text-white">
                        {i18n.t('sessions.lapLabel', { number: lap.lap })}
                      </Text>
                      {isBest ? (
                        <Text className={`text-xs font-medium ${accent.text}`}>
                          {i18n.t('sessions.best')}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <View className="items-end">
                      <Text
                        className="text-sm font-semibold text-zinc-900 dark:text-white"
                        style={{ fontVariant: ['tabular-nums'] }}
                      >
                        {lap.time}
                      </Text>
                      {lap.delta !== null ? (
                        <Text className="text-xs text-zinc-400 dark:text-zinc-500" style={{ fontVariant: ['tabular-nums'] }}>
                          {lap.delta}
                        </Text>
                      ) : (
                        <Text className={`text-xs ${accent.text}`}>—</Text>
                      )}
                    </View>
                    {!compareMode ? (
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color="#a1a1aa"
                      />
                    ) : null}
                  </View>
                </View>
              </Pressable>

              {/* Expanded sector tiles */}
              {isExpanded && lap.sectors.length > 0 ? (
                <View className="flex-row gap-2 mt-1.5">
                  {lap.sectors.map((sector, i) => {
                    const isSectorBest = lap.sectorMs[i] !== null && lap.sectorMs[i] === bestSectors[i];
                    return (
                      <View
                        key={i}
                        className={`flex-1 rounded-2xl p-3 border ${
                          isSectorBest
                            ? `${accent.bg} ${accent.border}`
                            : 'bg-zinc-50 dark:bg-black/20 border-zinc-100 dark:border-white/5'
                        }`}
                      >
                        <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                          {i18n.t('circuits.sectorLabel', { number: i + 1 })}
                        </Text>
                        <Text
                          className={sector ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 dark:text-zinc-600'}
                          style={{ fontSize: 15, fontWeight: '500', fontVariant: ['tabular-nums'] }}
                        >
                          {sector ?? '---.---'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* Compare table */}
      {compareA && compareB ? (
        <View className="mt-3 rounded-2xl bg-zinc-50 dark:bg-black/20 border border-zinc-100 dark:border-white/5 p-4">
          {/* Header */}
          <View className="flex-row mb-2">
            <View className="flex-1" />
            <Text className="flex-1 text-xs font-medium text-zinc-900 dark:text-white text-center">
              {i18n.t('sessions.lapLabel', { number: compareA.lap })}
            </Text>
            <Text className="flex-1 text-xs font-medium text-zinc-900 dark:text-white text-center">
              {i18n.t('sessions.lapLabel', { number: compareB.lap })}
            </Text>
            <Text className="flex-1 text-xs font-medium text-zinc-500 dark:text-zinc-400 text-center">Δ</Text>
          </View>

          {/* Lap time row */}
          <CompareRow
            label={i18n.t('sessions.lapRowLabel')}
            valueA={compareA.time}
            valueB={compareB.time}
            msA={compareA.timeMs}
            msB={compareB.timeMs}
            accentText={accent.text}
          />

          {/* Sector rows */}
          {compareA.sectors.map((_, i) => (
            <CompareRow
              key={i}
              label={i18n.t('circuits.sectorLabel', { number: i + 1 })}
              valueA={compareA.sectors[i] ?? '---.---'}
              valueB={compareB.sectors[i] ?? '---.---'}
              msA={compareA.sectorMs[i]}
              msB={compareB.sectorMs[i]}
              accentText={accent.text}
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function CompareRow({
  label,
  valueA,
  valueB,
  msA,
  msB,
  accentText,
}: {
  label: string;
  valueA: string;
  valueB: string;
  msA: number | null;
  msB: number | null;
  accentText: string;
}) {
  const aFaster = msA !== null && msB !== null && msA < msB;
  const bFaster = msA !== null && msB !== null && msB < msA;
  const delta = msA !== null && msB !== null ? formatDelta(msA, msB) : '—';

  return (
    <View className="flex-row py-1.5">
      <Text className="flex-1 text-xs text-zinc-500 dark:text-zinc-400">{label}</Text>
      <Text
        className={`flex-1 text-xs text-center ${aFaster ? accentText : 'text-zinc-900 dark:text-white'}`}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {valueA}
      </Text>
      <Text
        className={`flex-1 text-xs text-center ${bFaster ? accentText : 'text-zinc-900 dark:text-white'}`}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {valueB}
      </Text>
      <Text className="flex-1 text-xs text-zinc-500 dark:text-zinc-400 text-center" style={{ fontVariant: ['tabular-nums'] }}>
        {delta}
      </Text>
    </View>
  );
}
