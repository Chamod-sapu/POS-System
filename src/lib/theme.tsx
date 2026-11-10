import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
export type DensityMode = 'comfortable' | 'compact';

interface ThemeContextType {
  theme: ThemeMode;
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  density: DensityMode;
  setDensity: (density: DensityMode) => void;
  toggleDensity: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'wewala-theme';
const DENSITY_STORAGE_KEY = 'wewala-density';

const defaultThemeContext: ThemeContextType = {
  theme: 'system',
  effectiveTheme: 'light',
  setTheme: () => { },
  toggleTheme: () => { },
  density: 'comfortable',
  setDensity: () => { },
  toggleDensity: () => { },
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode;
      return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
    } catch {
      return 'system';
    }
  });

  const [density, setDensityState] = useState<DensityMode>(() => {
    try {
      const saved = localStorage.getItem(DENSITY_STORAGE_KEY) as DensityMode;
      return saved === 'compact' ? 'compact' : 'comfortable';
    } catch {
      return 'comfortable';
    }
  });

  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Listen to system preference changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches);
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const effectiveTheme: 'light' | 'dark' =
    theme === 'system' ? (systemIsDark ? 'dark' : 'light') : theme;

  // Apply dark class and color-scheme
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  }, [effectiveTheme]);

  // Apply density attribute
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('data-density', density);
  }, [density]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // storage disabled
    }
  };

  const toggleTheme = () => {
    const nextTheme: ThemeMode = effectiveTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  };

  const setDensity = (newDensity: DensityMode) => {
    setDensityState(newDensity);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, newDensity);
    } catch {
      // storage disabled
    }
  };

  const toggleDensity = () => {
    setDensity(density === 'comfortable' ? 'compact' : 'comfortable');
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        effectiveTheme,
        setTheme,
        toggleTheme,
        density,
        setDensity,
        toggleDensity,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  return context || defaultThemeContext;
};