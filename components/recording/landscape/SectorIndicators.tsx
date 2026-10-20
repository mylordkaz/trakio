import { Text, View } from 'react-native';
import type { SectorStatus } from '@/telemetry/live-reference';

const COLORS: Record<SectorStatus, string> = {
  faster: '#34d399',
  slower: '#f87171',
  active: '#fbbf24',
  neutral: '#d4d4d8',
  pending: '#3f3f46',
};

export default function SectorIndicators({ statuses, barHeight }: { statuses: SectorStatus[]; barHeight: number }) {
  if (statuses.length === 0) {
    return null;
  }
  return (
    <View style={{ gap: 10 }}>
      {statuses.map((status, index) => (
        <View key={index} className="flex-row items-center" style={{ gap: 10 }}>
          <Text className="text-sm text-zinc-500" style={{ width: 22, fontVariant: ['tabular-nums'] }}>
            S{index + 1}
          </Text>
          <View style={{ width: 8, height: barHeight, borderRadius: 4, backgroundColor: COLORS[status] }} />
        </View>
      ))}
    </View>
  );
}
