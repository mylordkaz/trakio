import { createContext, useCallback, useContext, useState } from 'react';
import { Storage } from 'expo-sqlite/kv-store';
import i18n from '@/i18n';
import { useColorScheme } from '@/hooks/useColorScheme';

type AppearanceMode = 'light' | 'dark' | 'system';

const APPEARANCE_KEY = 'appearance_mode';
const LOCALE_KEY = 'locale';

type MenuContextValue = {
  isMenuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  locale: string;
  setLocale: (locale: string) => void;
  appearanceMode: AppearanceMode;
  setAppearanceMode: (mode: AppearanceMode) => void;
};

const MenuContext = createContext<MenuContextValue>({
  isMenuOpen: false,
  openMenu: () => {},
  closeMenu: () => {},
  locale: i18n.locale,
  setLocale: () => {},
  appearanceMode: 'dark',
  setAppearanceMode: () => {},
});

export function MenuProvider({ children }: { children: React.ReactNode }) {
  const { setColorScheme } = useColorScheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [locale, setLocaleState] = useState(i18n.locale);
  const [appearanceMode, setAppearanceModeState] = useState<AppearanceMode>(() => {
    const stored = Storage.getItemSync(APPEARANCE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    return 'dark';
  });

  const openMenu = useCallback(() => setIsMenuOpen(true), []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  const setLocale = useCallback((nextLocale: string) => {
    i18n.locale = nextLocale;
    setLocaleState(nextLocale);
    Storage.setItemSync(LOCALE_KEY, nextLocale);
  }, []);

  const setAppearanceMode = useCallback((mode: AppearanceMode) => {
    setAppearanceModeState(mode);
    setColorScheme(mode);
    Storage.setItemSync(APPEARANCE_KEY, mode);
  }, [setColorScheme]);

  return (
    <MenuContext.Provider
      value={{ isMenuOpen, openMenu, closeMenu, locale, setLocale, appearanceMode, setAppearanceMode }}
    >
      {children}
    </MenuContext.Provider>
  );
}

export function useMenu() {
  return useContext(MenuContext);
}
