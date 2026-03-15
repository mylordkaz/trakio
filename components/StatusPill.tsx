import { View, Text } from 'react-native';

const COLOR_MAP = {
  violet: { container: 'bg-violet-500/15 border-violet-400/20', text: 'text-violet-300' },
  sky: { container: 'bg-sky-500/15 border-sky-400/20', text: 'text-sky-300' },
  emerald: { container: 'bg-emerald-500/15 border-emerald-400/20', text: 'text-emerald-400' },
  red: { container: 'bg-red-500/15 border-red-400/20', text: 'text-red-400' },
} as const;

type PillColor = keyof typeof COLOR_MAP;

export default function StatusPill({ text, color }: { text: string; color: PillColor }) {
  const colors = COLOR_MAP[color];
  return (
    <View className={`rounded-full px-3 py-1.5 border ${colors.container}`}>
      <Text className={`text-sm ${colors.text}`}>{text}</Text>
    </View>
  );
}
