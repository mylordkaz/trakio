import { View } from 'react-native';
import type { ViewProps } from 'react-native';

export default function Card({ children, className = '', ...props }: ViewProps & { className?: string }) {
  return (
    <View className={`rounded-3xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-4 ${className}`} {...props}>
      {children}
    </View>
  );
}
