import { Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SharedValue } from 'react-native-reanimated';
import { useT } from '@/hooks/useT';
import { formatLapTime } from '@/utils/format';
import type { CarFrameG } from '@/telemetry/car-frame-g';
import type { LiveDeltaState, SectorStatus } from '@/telemetry/live-reference';
import LapClock from './LapClock';
import SectorIndicators from './SectorIndicators';
import DeltaArc from './DeltaArc';
import GForceMeter from './GForceMeter';
import RecBadge from './RecBadge';

type Props = {
  lapLabel: string | number;
  bestLapMs: number | null;
  lastLapMs: number | null;
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

export default function LandscapeDashboard(props: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const contentWidth = width - insets.left - insets.right - 32;
  const meterSize = Math.min(150, Math.max(110, height * 0.36));

  return (
    <View
      className="flex-1 bg-zinc-950"
      style={{ paddingLeft: insets.left + 16, paddingRight: insets.right + 16, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 4 }}
    >
      <View className="flex-row items-start justify-between">
        <View className="rounded-2xl bg-white/5 border border-white/10 items-center px-7 py-2">
          <Text className="text-sm tracking-widest text-zinc-500">{t('sessions.laps').toUpperCase()}</Text>
          <Text style={{ fontSize: 40, lineHeight: 44, fontVariant: ['tabular-nums'] }} className="font-bold text-white">
            {props.lapLabel}
          </Text>
        </View>
        {props.warning ? (
          <View className={`rounded-full px-4 py-1.5 border mt-1 ${props.warning.severe ? 'bg-red-500/15 border-red-400/30' : 'bg-amber-500/15 border-amber-400/30'}`}>
            <Text className={`text-sm ${props.warning.severe ? 'text-red-400' : 'text-amber-400'}`}>{props.warning.message}</Text>
          </View>
        ) : null}
        <View className="flex-row rounded-2xl bg-white/5 border border-white/10 px-5 py-2">
          <View className="items-center pr-5">
            <Text className="text-sm tracking-widest text-zinc-500 uppercase">{t('session.bestLap')}</Text>
            <Text style={{ fontSize: 30, lineHeight: 36, fontVariant: ['tabular-nums'] }} className="font-bold text-emerald-400">
              {formatLapTime(props.bestLapMs)}
            </Text>
          </View>
          <View style={{ width: 1 }} className="bg-white/10 my-1" />
          <View className="items-center pl-5">
            <Text className="text-sm tracking-widest text-zinc-500 uppercase">{t('session.lastLap')}</Text>
            <Text style={{ fontSize: 30, lineHeight: 36, fontVariant: ['tabular-nums'] }} className="font-bold text-white">
              {formatLapTime(props.lastLapMs)}
            </Text>
          </View>
        </View>
      </View>

      <View className="flex-1 flex-row items-center">
        <View style={{ width: 72 }}>
          <SectorIndicators statuses={props.sectorStatuses} />
        </View>
        <View className="flex-1 items-center justify-center">
          <LapClock
            label={t('recording.currentLap')}
            waitingLabel={t('recording.waitingForStartLine')}
            startedWallClockMs={props.lapStartedWallClockMs}
          />
        </View>
        <View style={{ width: meterSize + 16 }} className="items-center">
          <GForceMeter
            size={meterSize}
            reading={props.gReading}
            lateralSv={props.lateralSv}
            longitudinalSv={props.longitudinalSv}
            lateralLabel="LAT"
            longitudinalLabel="LONG"
            aligningLabel={t('recording.gAligning')}
          />
        </View>
      </View>

      <View>
        <DeltaArc
          width={contentWidth}
          deltaMs={props.liveDelta.deltaMs}
          referenceLabel={
            props.liveDelta.referenceLapNumber === null
              ? t('recording.deltaNoReference')
              : t('recording.deltaReference', { lap: props.liveDelta.referenceLapNumber })
          }
          dimmed={props.deltaDimmed}
        />
        <View className="absolute right-0 bottom-2">
          <RecBadge
            label={t('session.recording')}
            pitInLabel={t('session.markPitIn')}
            pitInDoneLabel={t('session.pitInMarked')}
            endLabel={t('session.end')}
            pitInMarked={props.pitInMarked}
            onPitIn={props.onPitIn}
            onEnd={props.onEnd}
          />
        </View>
      </View>
    </View>
  );
}
