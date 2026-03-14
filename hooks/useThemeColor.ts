import { Colors, type ThemeColors } from '@/constants/colors';
import { useColorScheme } from '@/hooks/useColorScheme';

export function useThemeColor(
  colorName: keyof ThemeColors,
  props?: { light?: string; dark?: string }
) {
  const theme = useColorScheme() ?? 'dark';

  if (props) {
    const colorFromProps = props[theme];
    if (colorFromProps) return colorFromProps;
  }

  return Colors[theme][colorName];
}

export function useTheme() {
  const scheme = useColorScheme() ?? 'dark';
  return Colors[scheme];
}
