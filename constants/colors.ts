// Theme colors kept as reference for non-Tailwind contexts (tab bar, status bar, etc.)
export const Colors = {
  dark: {
    background: '#09090b',
    tabBarBorder: 'rgba(255, 255, 255, 0.10)',
    tabActive: '#0ea5e9',
    tabInactive: '#a1a1aa',
  },
  light: {
    background: '#f8f8fa',
    tabBarBorder: 'rgba(0, 0, 0, 0.08)',
    tabActive: '#0ea5e9',
    tabInactive: '#687076',
  },
} as const;
