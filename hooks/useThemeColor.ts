import { Colors } from '@/constants/colors';
import { useColorScheme } from '@/hooks/useColorScheme';

type ThemeColors = (typeof Colors)['dark'];

export function useThemeColor(
  colorName: keyof ThemeColors,
  props?: { light?: string; dark?: string }
) {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme ?? 'dark';

  if (props) {
    const colorFromProps = props[theme];
    if (colorFromProps) return colorFromProps;
  }

  return Colors[theme][colorName];
}

export function useTheme() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme ?? 'dark';
  return Colors[scheme];
}
