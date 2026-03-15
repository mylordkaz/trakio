import { useColorScheme } from '@/hooks/useColorScheme';

const ACCENTS = {
  sky: 'rgba(14,165,233,',
  emerald: 'rgba(16,185,129,',
  red: 'rgba(239,68,68,',
  violet: 'rgba(139,92,246,',
} as const;

type AccentKey = keyof typeof ACCENTS;

export function useHeaderGradient(accent: AccentKey): [string, string, string] {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const base = ACCENTS[accent];
  const bg = isDark ? '#18181b' : '#fafafa';
  const opacity = isDark ? '0.15)' : '0.10)';
  return [`${base}${opacity}`, bg, bg];
}
