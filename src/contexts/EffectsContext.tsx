import React, { createContext, useContext, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

// How much glow and motion the dashboard shows. Set per device in the menu:
// an old wall tablet may want less than a desktop.
export type EffectsLevel = 'off' | 'subtle' | 'strong';

interface EffectsContextType {
  level: EffectsLevel;
  setLevel: (level: EffectsLevel) => void;
  // Factor for glow strength: 0 (off), 1 (subtle), 1.8 (strong)
  k: number;
  // Whether animations and glows are shown at all
  on: boolean;
}

const factors: Record<EffectsLevel, number> = { off: 0, subtle: 1, strong: 1.8 };

const EffectsContext = createContext<EffectsContextType>({
  level: 'subtle',
  setLevel: () => {},
  k: 1,
  on: true,
});

export const useEffects = () => useContext(EffectsContext);

export const EffectsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [level, setLevel] = useLocalStorage<EffectsLevel>('effects', 'subtle');
  const k = factors[level] ?? 1;

  useEffect(() => {
    document.documentElement.dataset.effects = level;
  }, [level]);

  return <EffectsContext.Provider value={{ level, setLevel, k, on: k > 0 }}>{children}</EffectsContext.Provider>;
};

// Alpha scaled by the effect factor, capped at 1
export const fxAlpha = (k: number, alpha: number) => Math.min(1, alpha * k);

// "#rrggbb" with an alpha as rgba()
export const rgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
};
