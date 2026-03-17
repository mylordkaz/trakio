import { View, Text } from 'react-native';

type LapItem = {
  lap: number;
  time: string;
  delta: string;
};

export default function LapRow({ item }: { item: LapItem }) {
  return (
    <View className="flex-row items-center justify-between rounded-2xl bg-zinc-50 dark:bg-black/20 px-3 py-2.5 border border-zinc-100 dark:border-white/5">
      <Text className="text-sm font-medium text-zinc-900 dark:text-white">Lap {item.lap}</Text>
      <View className="items-end">
        <Text className="text-sm font-semibold text-zinc-900 dark:text-white">{item.time}</Text>
        <Text
          className={`text-xs ${item.delta.startsWith('-') ? 'text-emerald-400' : 'text-zinc-400 dark:text-zinc-500'}`}
        >
          {item.delta}
        </Text>
      </View>
    </View>
  );
}
