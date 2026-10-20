import { Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SharedValue } from 'react-native-reanimated';
import { useT } from '@/hooks/useT';
import { formatDeltaMs, formatLapTime } from '@/utils/format';
import type { CarFrameG } from '@/telemetry/car-frame-g';
import type { LiveDeltaState, SectorStatus } from '@/telemetry/live-reference';
import LapClock from './LapClock';
import SectorIndicators from './SectorIndicators';
import DeltaBar from './DeltaBar';
import GForceMeter, { GReadout } from './GForceMeter';
import RecBadge from './RecBadge';

// Three bands: tiles on top, sectors | clock + delta | G meter in the middle,
// delta bar + REC at the bottom. Every size comes from the screen so nothing
// overlaps on smaller phones.
const SIDE_PADDING = 16;
const SECTOR_COLUMN = 56;
const METER_COLUMN = 132;

type Props = {
  lapLabel: string | number;
  bestLapMs: number | null;
  lastLapMs: number | null;
  // Laps timed across a GPS gap are shown with ≈, as everywhere else.
  bestLapEstimated: boolean;
  lastLapEstimated: boolean;
  lapStartedWallClockMs: number | null;
  sectorStatuses: SectorStatus[];
  liveDelta: LiveDeltaState;
  deltaDimmed: boolean;
  gReading: CarFrameG;
  lateralSv: SharedValue<number>;
  longitudinalSv: SharedValue<number>;
  pitInMarked: boolean;
  warning: { message: string; severe: boolean } | null;
  onPitIn: () => void;
  onEnd: () => void;
};

function TimeTile({ label, ms, estimated, accent }: { label: string; ms: number | null; estimated: boolean; accent: boolean }) {
  return (
    <View style={{ gap: 2 }}>
      <Text className="text-[11px] tracking-widest text-zinc-500 uppercase">{label}</Text>
      <Text
        style={{ fontSize: 22, lineHeight: 26, fontVariant: ['tabular-nums'] }}
        className={`font-bold ${accent ? 'text-emerald-400' : 'text-white'}`}
      >
        {`${estimated && ms !== null ? '≈' : ''}${formatLapTime(ms)}`}
      </Text>
    </View>
  );
}

export default function LandscapeDashboard(props: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const innerWidth = width - insets.left - insets.right - 2 * SIDE_PADDING;
  const innerHeight = height - insets.top - insets.bottom;
  const centerWidth = innerWidth - SECTOR_COLUMN - METER_COLUMN;
  const clockFontSize = Math.round(Math.max(48, Math.min(104, centerWidth / 5.6, innerHeight * 0.27)));
  const meterSize = Math.round(Math.max(64, Math.min(88, innerHeight * 0.24)));
  const sectorBarHeight = Math.round(Math.max(22, Math.min(36, innerHeight * 0.09)));

  const { deltaMs, referenceLapNumber } = props.liveDelta;
  const hasDelta = deltaMs !== null;
  const isFaster = hasDelta && deltaMs < 0;
  const deltaColor = !hasDelta ? 'text-zinc-600' : isFaster ? 'text-emerald-400' : 'text-red-400';

  return (
    <View
      className="flex-1 bg-zinc-950"
      style={{
        paddingLeft: insets.left + SIDE_PADDING,
        paddingRight: insets.right + SIDE_PADDING,
        paddingTop: Math.max(insets.top, 12),
        paddingBottom: Math.max(insets.bottom, 10),
      }}
    >
      {/* Top band */}
      <View className="flex-row items-start" style={{ gap: 12 }}>
        <View className="rounded-xl bg-white/5 border border-white/10 items-center px-4 py-1.5">
          <Text className="text-[11px] tracking-widest text-zinc-500 uppercase">{t('recording.lap')}</Text>
          <Text style={{ fontSize: 30, lineHeight: 34, fontVariant: ['tabular-nums'] }} className="font-bold text-white">
            {props.lapLabel}
          </Text>
        </View>
        <View className="flex-1 items-center pt-1">
          {props.warning ? (
            <View
              className={`rounded-full px-3 py-1 border ${props.warning.severe ? 'bg-red-500/10 border-red-500/40' : 'bg-amber-500/10 border-amber-400/40'}`}
            >
              <Text numberOfLines={1} className={`text-xs ${props.warning.severe ? 'text-red-400' : 'text-amber-400'}`}>
                {props.warning.message}
              </Text>
            </View>
          ) : null}
        </View>
        <View className="flex-row items-center rounded-xl bg-white/5 border border-white/10 px-4 py-1.5" style={{ gap: 16 }}>
          <TimeTile label={t('session.bestLap')} ms={props.bestLapMs} estimated={props.bestLapEstimated} accent />
          <View style={{ width: 1, alignSelf: 'stretch' }} className="bg-white/10" />
          <TimeTile label={t('session.lastLap')} ms={props.lastLapMs} estimated={props.lastLapEstimated} accent={false} />
        </View>
      </View>

      {/* Middle band */}
      <View className="flex-1 flex-row items-center">
        <View style={{ width: SECTOR_COLUMN }}>
          <SectorIndicators statuses={props.sectorStatuses} barHeight={sectorBarHeight} />
        </View>
        <View className="flex-1 items-center justify-center" style={{ minWidth: 0 }}>
          <Text className="text-xs tracking-widest text-zinc-500 uppercase">{t('recording.currentLap')}</Text>
          <LapClock
            fontSize={clockFontSize}
            waitingLabel={t('recording.waitingForStartLine')}
            startedWallClockMs={props.lapStartedWallClockMs}
          />
          <View className="bg-white/10" style={{ height: 1, width: Math.round(clockFontSize * 3.6), marginVertical: 4 }} />
          <View className="flex-row items-center" style={{ gap: 8, opacity: props.deltaDimmed ? 0.45 : 1 }}>
            {hasDelta ? (
              <Text style={{ fontSize: Math.round(clockFontSize * 0.24) }} className={deltaColor}>
                {isFaster ? '▼' : '▲'}
              </Text>
            ) : null}
            <Text
              style={{
                fontSize: Math.round(clockFontSize * 0.36),
                lineHeight: Math.round(clockFontSize * 0.42),
                fontVariant: ['tabular-nums'],
              }}
              className={`font-bold ${deltaColor}`}
            >
              {hasDelta ? formatDeltaMs(deltaMs) : '--.---'}
            </Text>
          </View>
          <Text className="text-xs text-zinc-500">
            {referenceLapNumber === null
              ? t('recording.deltaNoReference')
              : t('recording.deltaReference', { lap: referenceLapNumber })}
          </Text>
        </View>
        <View style={{ width: METER_COLUMN }} className="items-center">
          <View className="items-center" style={{ marginRight: 36, gap: 6 }}>
            <View>
              <GForceMeter
                size={meterSize}
                aligned={props.gReading.aligned}
                lateralSv={props.lateralSv}
                longitudinalSv={props.longitudinalSv}
              />
              <View style={{ position: 'absolute', left: meterSize + 8, top: -4 }}>
                <GReadout valueG={props.gReading.lateralG} label="LAT" />
              </View>
            </View>
            {props.gReading.aligned ? (
              <GReadout valueG={props.gReading.longitudinalG} label="LONG" />
            ) : (
              <Text className="text-[10px] text-zinc-500" style={{ lineHeight: 14 }}>
                {t('recording.gAligning')}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Bottom band */}
      <View className="flex-row items-end" style={{ gap: 16 }}>
        <View className="flex-1" style={{ marginLeft: SECTOR_COLUMN / 2 }}>
          <DeltaBar deltaMs={deltaMs} dimmed={props.deltaDimmed} />
        </View>
        <RecBadge
          label={t('session.recording')}
          pitInLabel={t('recording.pit')}
          pitInDoneLabel={t('recording.pitMarked')}
          endLabel={t('recording.end')}
          pitInMarked={props.pitInMarked}
          onPitIn={props.onPitIn}
          onEnd={props.onEnd}
        />
      </View>
    </View>
  );
}
