import { View, Text } from 'react-native';

type LapItem = {
  lap: number;
  time: string;
  delta: string;
  status: string;
};

export default function LapRow({ item }: { item: LapItem }) {
  return (
    <View className="flex-row items-center justify-between rounded-2xl bg-black/20 px-3 py-2.5 border border-white/5">
      <View>
        <Text className="text-sm font-medium text-white">Lap {item.lap}</Text>
        <Text className="text-xs text-zinc-500">{item.status}</Text>
      </View>
      <View className="items-end">
        <Text className="text-sm font-semibold text-white">{item.time}</Text>
        <Text
          className={`text-xs ${item.delta.startsWith('-') ? 'text-emerald-400' : 'text-zinc-500'}`}
        >
          {item.delta}
        </Text>
      </View>
    </View>
  );
}
