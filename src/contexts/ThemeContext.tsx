import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeProvider as EmotionThemeProvider } from '@emotion/react';
import { useLocalStorage } from '../hooks/useLocalStorage';

export interface Theme {
  mode: 'light' | 'dark';
  colors: {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    primary: string;
    hover: string;
  };
}

const lightTheme: Theme = {
  mode: 'light',
  colors: {
    background: '#ffffff',
    surface: '#f9f9f9',
    text: '#333333',
    textSecondary: '#555555',
    border: '#dddddd',
    primary: '#ffffff',
    hover: '#f0f0f0',
  },
};

const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    background: '#181a1b',
    surface: '#202224',
    text: '#c8c3bc',
    textSecondary: '#a8a3a4',
    border: '#333333',
    primary: '#202224',
    hover: '#282a2c',
  },
};

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

  const theme = isDark ? darkTheme : lightTheme;

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  useEffect(() => {
    document.body.style.backgroundColor = theme.colors.background;
    document.body.style.color = theme.colors.text;
  }, [isDark, theme]);

  return (
    <EmotionThemeProvider theme={theme}>
      <ThemeContext.Provider value={{ theme, toggleTheme }}>
        {children}
      </ThemeContext.Provider>
    </EmotionThemeProvider>
  );
};