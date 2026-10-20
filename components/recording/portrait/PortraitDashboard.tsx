import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { SharedValue } from 'react-native-reanimated';
import { useT } from '@/hooks/useT';
import { formatDeltaMs, formatLapTime, formatSectorTime } from '@/utils/format';
import type { CarFrameG } from '@/telemetry/car-frame-g';
import type { LiveDeltaState, SectorCard, SectorStatus } from '@/telemetry/live-reference';
import LapClock, { type Tone } from '../landscape/LapClock';
import GForceMeter, { GReadout } from '../landscape/GForceMeter';
import { RecPill } from '../landscape/RecBadge';

// One fixed screen: header, lap card (lap / best / last, clock, delta),
// sector cards, telemetry card (G meter, speed, braking), then Pit and End.
// The clock is sized from the screen so the whole page fits without scrolling.
const H_PADDING = 20;
const CARD_PADDING = 16;

type Banner = { message: string; tone: 'red' | 'amber' | 'neutral' };

type Props = {
  tone: Tone;
  gradientColors: readonly [string, string, ...string[]];
  trackTitle: string;
  sessionName: string;
  durationLabel: string;
  banner: Banner | null;
  lapLabel: string | number;
  bestLapMs: number | null;
  lastLapMs: number | null;
  // Laps timed across a GPS gap are shown with ≈, as everywhere else.
  bestLapEstimated: boolean;
  lastLapEstimated: boolean;
  lapStartedWallClockMs: number | null;
  liveDelta: LiveDeltaState;
  deltaDimmed: boolean;
  sectorCards: SectorCard[];
  gReading: CarFrameG;
  lateralSv: SharedValue<number>;
  longitudinalSv: SharedValue<number>;
  sourceLabel: string;
  accuracy: { label: string; state: 'good' | 'degraded' | 'lost' | 'none' };
  speedKph: number | null;
  brakePercent: number;
  pitInMarked: boolean;
  onPitIn: () => void;
  onEnd: () => void;
};

const STATUS_TEXT: Record<SectorStatus, string> = {
  faster: 'text-emerald-500 dark:text-emerald-400',
  slower: 'text-red-500 dark:text-red-400',
  active: 'text-amber-500 dark:text-amber-400',
  neutral: 'text-zinc-900 dark:text-white',
  pending: 'text-zinc-400 dark:text-zinc-500',
};

const STATUS_BAR: Record<SectorStatus, string> = {
  faster: 'bg-emerald-400',
  slower: 'bg-red-400',
  active: 'bg-amber-400',
  neutral: 'bg-zinc-400',
  pending: 'bg-transparent',
};

const ACCURACY_TEXT = {
  good: 'text-emerald-500 dark:text-emerald-400',
  degraded: 'text-amber-500 dark:text-amber-400',
  lost: 'text-red-500 dark:text-red-400',
  none: 'text-zinc-400 dark:text-zinc-500',
} as const;

const BANNER_BOX = {
  red: 'bg-red-500/10 border-red-500/30',
  amber: 'bg-amber-500/10 border-amber-500/30',
  neutral: 'bg-zinc-100 dark:bg-white/5 border-zinc-200 dark:border-white/10',
} as const;

const BANNER_TEXT = {
  red: 'text-red-600 dark:text-red-300',
  amber: 'text-amber-700 dark:text-amber-300',
  neutral: 'text-zinc-500 dark:text-zinc-400',
} as const;

function lapTimeLabel(ms: number | null, estimated: boolean) {
  return `${estimated && ms !== null ? '≈' : ''}${formatLapTime(ms)}`;
}

const CARD = 'rounded-3xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10';

function LapStat({ label, value, valueClass }: { label: string; value: string; valueClass: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-[11px] tracking-widest text-zinc-500 dark:text-zinc-400 uppercase">{label}</Text>
      <Text style={{ fontSize: 22, lineHeight: 28, fontVariant: ['tabular-nums'] }} className={`font-bold ${valueClass}`}>
        {value}
      </Text>
    </View>
  );
}

function SectorTile({ index, card }: { index: number; card: SectorCard }) {
  const text =
    card.valueMs === null ? '--.---' : card.isDelta ? formatDeltaMs(card.valueMs) : formatSectorTime(card.valueMs);
  return (
    <View className={`flex-1 rounded-2xl bg-white/80 dark:bg-black/40 border border-zinc-200 dark:border-white/10 px-3 py-2.5`} style={{ gap: 4 }}>
      <Text className="text-xs text-zinc-500 dark:text-zinc-400">S{index + 1}</Text>
      <Text
        numberOfLines={1}
        style={{ fontSize: 18, lineHeight: 22, fontVariant: ['tabular-nums'] }}
        className={`font-bold ${STATUS_TEXT[card.status]}`}
      >
        {text}
      </Text>
      <View className="h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
        <View className={`h-full rounded-full ${STATUS_BAR[card.status]}`} style={{ width: `${Math.round(card.progress * 100)}%` }} />
      </View>
    </View>
  );
}

export default function PortraitDashboard(props: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const contentWidth = width - 2 * H_PADDING - 2 * CARD_PADDING;
  const clockFontSize = Math.round(Math.max(48, Math.min(92, contentWidth / 4.9, height * 0.09)));
  const meterSize = Math.round(Math.max(72, Math.min(104, height * 0.11)));

  const { deltaMs, referenceLapNumber } = props.liveDelta;
  const hasDelta = deltaMs !== null;
  const isFaster = hasDelta && deltaMs < 0;
  const deltaColor = !hasDelta
    ? 'text-zinc-400 dark:text-zinc-600'
    : isFaster
      ? 'text-emerald-500 dark:text-emerald-400'
      : 'text-red-500 dark:text-red-400';
  const primaryText = props.tone === 'dark' ? 'text-white' : 'text-zinc-900';

  return (
    <View className="flex-1 bg-zinc-50 dark:bg-zinc-900">
      <LinearGradient
        colors={props.gradientColors}
        locations={[0, 0.5, 1]}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: insets.top + 260 }}
      />
      <View className="flex-1" style={{ paddingTop: insets.top + 12, paddingHorizontal: H_PADDING, paddingBottom: 12, gap: 12 }}>
        {/* Header */}
        <View className="flex-row items-start justify-between">
          <View className="flex-1 mr-3">
            <Text numberOfLines={1} className="text-[11px] tracking-widest text-zinc-500 dark:text-zinc-400 uppercase">
              {props.trackTitle}
            </Text>
            <Text numberOfLines={1} className={`text-2xl font-bold tracking-tight ${primaryText}`}>
              {props.sessionName}
            </Text>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400" style={{ fontVariant: ['tabular-nums'] }}>
              {t('recording.sessionRecording')} · {props.durationLabel}
            </Text>
          </View>
          <RecPill label={t('session.recording')} />
        </View>

        {props.banner ? (
          <View className={`rounded-full border px-3 py-1.5 self-center ${BANNER_BOX[props.banner.tone]}`}>
            <Text numberOfLines={1} className={`text-xs ${BANNER_TEXT[props.banner.tone]}`}>
              {props.banner.message}
            </Text>
          </View>
        ) : null}

        {/* Lap card */}
        <View className={`flex-1 justify-center ${CARD}`} style={{ padding: CARD_PADDING, gap: 6 }}>
          <View className="flex-row items-center">
            <LapStat label={t('recording.lap')} value={String(props.lapLabel)} valueClass={primaryText} />
            <View className="bg-zinc-200 dark:bg-white/10" style={{ width: 1, alignSelf: 'stretch' }} />
            <LapStat label={t('session.bestLap')} value={lapTimeLabel(props.bestLapMs, props.bestLapEstimated)} valueClass="text-emerald-500 dark:text-emerald-400" />
            <View className="bg-zinc-200 dark:bg-white/10" style={{ width: 1, alignSelf: 'stretch' }} />
            <LapStat label={t('session.lastLap')} value={lapTimeLabel(props.lastLapMs, props.lastLapEstimated)} valueClass={primaryText} />
          </View>
          <View className="items-center" style={{ marginTop: 6 }}>
            <Text className="text-xs tracking-widest text-zinc-500 dark:text-zinc-400 uppercase">{t('recording.currentLap')}</Text>
            <LapClock
              fontSize={clockFontSize}
              tone={props.tone}
              waitingLabel={t('recording.waitingForStartLine')}
              startedWallClockMs={props.lapStartedWallClockMs}
            />
            <View className="flex-row items-center" style={{ gap: 8, opacity: props.deltaDimmed ? 0.45 : 1 }}>
              {hasDelta ? (
                <Text style={{ fontSize: Math.round(clockFontSize * 0.3) }} className={deltaColor}>
                  {isFaster ? '▼' : '▲'}
                </Text>
              ) : null}
              <Text
                style={{ fontSize: Math.round(clockFontSize * 0.46), lineHeight: Math.round(clockFontSize * 0.54), fontVariant: ['tabular-nums'] }}
                className={`font-bold ${deltaColor}`}
              >
                {hasDelta ? formatDeltaMs(deltaMs) : '--.---'}
              </Text>
            </View>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">
              {referenceLapNumber === null
                ? t('recording.deltaNoReference')
                : t('recording.deltaReference', { lap: referenceLapNumber })}
            </Text>
          </View>
        </View>

        {/* Sectors */}
        {props.sectorCards.length > 0 ? (
          <View className="flex-row" style={{ gap: 8 }}>
            {props.sectorCards.map((card, index) => (
              <SectorTile key={index} index={index} card={card} />
            ))}
          </View>
        ) : null}

        {/* Telemetry */}
        <View className={CARD} style={{ padding: CARD_PADDING, gap: 12 }}>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <Text className={`text-base font-semibold ${primaryText}`}>{t('telemetry.title')}</Text>
              <View className="rounded-full bg-emerald-500/15 px-2.5 py-0.5">
                <Text numberOfLines={1} className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {props.sourceLabel}
                </Text>
              </View>
            </View>
            <Text className={`text-sm ${ACCURACY_TEXT[props.accuracy.state]}`}>{props.accuracy.label}</Text>
          </View>
          <View className="flex-row items-center">
            <View className="flex-row items-center" style={{ gap: 14 }}>
              <GForceMeter
                size={meterSize}
                aligned={props.gReading.aligned}
                lateralSv={props.lateralSv}
                longitudinalSv={props.longitudinalSv}
                tone={props.tone}
              />
              {props.gReading.aligned ? (
                <View style={{ gap: 14 }}>
                  <GReadout valueG={props.gReading.lateralG} label="LAT" tone={props.tone} />
                  <GReadout valueG={props.gReading.longitudinalG} label="LONG" tone={props.tone} />
                </View>
              ) : (
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{t('recording.gAligning')}</Text>
              )}
            </View>
            <View className="bg-zinc-200 dark:bg-white/10 mx-4" style={{ width: 1, alignSelf: 'stretch' }} />
            <View className="flex-1" style={{ gap: 10 }}>
              <View>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{t('telemetry.speed')}</Text>
                <View className="flex-row items-baseline" style={{ gap: 4 }}>
                  <Text style={{ fontSize: 28, lineHeight: 32, fontVariant: ['tabular-nums'] }} className={`font-bold ${primaryText}`}>
                    {props.speedKph === null ? '--' : Math.round(props.speedKph)}
                  </Text>
                  <Text className="text-sm text-zinc-500 dark:text-zinc-400">km/h</Text>
                </View>
              </View>
              <View style={{ gap: 6 }}>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-zinc-500 dark:text-zinc-400">{t('telemetry.brake')}</Text>
                  <Text className="text-xs text-zinc-500 dark:text-zinc-400" style={{ fontVariant: ['tabular-nums'] }}>
                    {props.brakePercent}%
                  </Text>
                </View>
                <View className="h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
                  <View className="h-full rounded-full bg-red-400" style={{ width: `${props.brakePercent}%` }} />
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Controls */}
        <View className="flex-row" style={{ gap: 12 }}>
          <Pressable
            onPress={props.onPitIn}
            disabled={props.pitInMarked}
            className={`flex-1 flex-row items-center justify-center rounded-2xl border py-3.5 ${
              props.pitInMarked
                ? 'border-amber-400/40 bg-amber-500/10'
                : 'border-zinc-200 dark:border-white/10 bg-white/80 dark:bg-white/5'
            }`}
            style={{ gap: 8 }}
          >
            <Ionicons
              name="flag-outline"
              size={16}
              color={props.pitInMarked ? '#f59e0b' : props.tone === 'dark' ? '#fafafa' : '#18181b'}
            />
            <Text className={`text-sm font-semibold ${props.pitInMarked ? 'text-amber-600 dark:text-amber-300' : primaryText}`}>
              {props.pitInMarked ? t('session.pitInMarked') : t('session.markPitIn')}
            </Text>
          </Pressable>
          <Pressable onPress={props.onEnd} className="flex-1 flex-row items-center justify-center rounded-2xl bg-red-500 py-3.5" style={{ gap: 8 }}>
            <Ionicons name="stop" size={14} color="#ffffff" />
            <Text className="text-sm font-semibold text-white">{t('session.end')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
