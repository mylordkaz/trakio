const tintColorLight = '#1A9B6E';
const tintColorDark = '#34D399';

export const Colors = {
  light: {
    text: '#11181C',
    textSecondary: '#687076',
    background: '#F8F8FA',
    surface: '#FFFFFF',
    surfaceBorder: '#E4E4E7',
    tint: tintColorLight,
    accent: tintColorLight,
    accentRed: '#DC2626',
    accentBlue: '#5B8DEF',
    accentPurple: '#7C5CFC',
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#FFFFFF',
    textSecondary: '#8E8E93',
    background: '#0A0A0F',
    surface: '#1A1A24',
    surfaceBorder: '#2A2A35',
    tint: tintColorDark,
    accent: tintColorDark,
    accentRed: '#FF4757',
    accentBlue: '#5B8DEF',
    accentPurple: '#7C5CFC',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
} as const;

export type ThemeColors = typeof Colors.light;
