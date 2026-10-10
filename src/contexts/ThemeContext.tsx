import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

// Light or dark: the system's choice until switched in the menu. The colors
// are CSS variables in styles.css, selected by data-theme on <html>.
export interface Theme {
  mode: 'light' | 'dark';
}

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// --background in styles.css
const themeColors = { light: '#ffffff', dark: '#0a0a0a' };

const darkQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)');

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // null: follow the system
  const [storedDark, setStoredDark] = useLocalStorage<boolean | null>('theme-dark', null);
  const [systemDark, setSystemDark] = useState(() => darkQuery()?.matches ?? false);
  const mode = (storedDark ?? systemDark) ? 'dark' : 'light';

  // openccu-lite opens the app in its frame with its theme (?theme=
  // system|light|dark) and posts a change; the menu's switch still works
  useEffect(() => {
    const follow = (theme: unknown) => {
      if (theme === 'dark' || theme === 'light') setStoredDark(theme === 'dark');
      else if (theme === 'system') setStoredDark(null);
    };
    follow(new URLSearchParams(window.location.search).get('theme'));
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === 'openccu-lite:theme')
        follow(event.data.theme);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // Once: the first setter writes the same state and storage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const query = darkQuery();
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    // Browser bar and installed app follow the switch, not only the system
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((meta) => (meta.content = themeColors[mode]));
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ theme: { mode }, toggleTheme: () => setStoredDark(mode !== 'dark') }}>
      {children}
    </ThemeContext.Provider>
  );
};
