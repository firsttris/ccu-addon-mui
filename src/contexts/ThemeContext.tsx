import React, { createContext, useContext, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

// Light or dark, switched in the header. The colors are CSS variables in
// styles.css, selected by data-theme on <html>.
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

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useLocalStorage('theme-dark', false);
  const mode = isDark ? 'dark' : 'light';

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ theme: { mode }, toggleTheme: () => setIsDark(!isDark) }}>
      {children}
    </ThemeContext.Provider>
  );
};
