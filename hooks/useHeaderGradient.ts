import { useColorScheme } from '@/hooks/useColorScheme';

const ACCENTS = {
  sky: 'rgba(14,165,233,',
  emerald: 'rgba(16,185,129,',
  red: 'rgba(239,68,68,',
  violet: 'rgba(139,92,246,',
} as const;

type AccentKey = keyof typeof ACCENTS;

// Light mode has no gradient: flat background, accent colors live only in
// texts and buttons. Dark mode keeps the accent glow.
export function useHeaderGradient(accent: AccentKey): [string, string, string] {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const bg = isDark ? '#18181b' : '#fafafa';

  if (!isDark) {
    return [bg, bg, bg];
  }

  return [`${ACCENTS[accent]}0.15)`, bg, bg];
}
