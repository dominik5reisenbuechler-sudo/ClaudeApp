import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { themes } from './tokens';
import type { Theme, ThemeName } from './tokens';
import { readJson, writeJson } from '@/lib/storage';

/** `system` follows the OS setting; the other two override it. */
export type ThemePreference = ThemeName | 'system';

const STORAGE_KEY = 'theme-preference';

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let cancelled = false;
    void readJson<ThemePreference>(STORAGE_KEY).then((stored) => {
      if (!cancelled && stored) setPreferenceState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const resolved: ThemeName =
      preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;

    return {
      theme: themes[resolved],
      preference,
      setPreference: (next) => {
        setPreferenceState(next);
        void writeJson(STORAGE_KEY, next);
      },
    };
  }, [preference, systemScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside a ThemeProvider');
  return context.theme;
}

export function useThemePreference(): Omit<ThemeContextValue, 'theme'> {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useThemePreference must be used inside a ThemeProvider');
  const { preference, setPreference } = context;
  return { preference, setPreference };
}
