import { Text, View } from 'react-native';
import type { SectorStatus } from '@/telemetry/live-reference';

const COLORS: Record<SectorStatus, string> = {
  faster: '#34d399',
  slower: '#f87171',
  active: '#fbbf24',
  neutral: '#d4d4d8',
  pending: '#52525b',
};

export default function SectorIndicators({ statuses }: { statuses: SectorStatus[] }) {
  if (statuses.length === 0) {
    return null;
  }
  return (
    <View className="gap-4">
      {statuses.map((status, index) => (
        <View key={index} className="flex-row items-center gap-3">
          <Text className="w-7 text-base text-zinc-500" style={{ fontVariant: ['tabular-nums'] }}>
            S{index + 1}
          </Text>
          <View style={{ width: 10, height: 44, borderRadius: 5, backgroundColor: COLORS[status] }} />
        </View>
      ))}
    </View>
  );
}
