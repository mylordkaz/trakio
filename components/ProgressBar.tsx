import { View, Text } from 'react-native';

export default function ProgressBar({
  label,
  value,
  color = 'bg-white',
}: {
  label: string;
  value: string;
  color?: string;
}) {
  const numericValue = parseInt(value, 10);

  return (
    <View>
      <View className="flex-row justify-between mb-1">
        <Text className="text-xs text-zinc-400">{label}</Text>
        <Text className="text-xs text-zinc-400">{value}</Text>
      </View>
      <View className="h-2 rounded-full bg-white/10 overflow-hidden">
        <View
          className={`h-full rounded-full ${color}`}
          style={{ width: `${numericValue}%` }}
        />
      </View>
    </View>
  );
}
