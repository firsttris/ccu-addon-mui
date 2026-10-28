import { useSyncExternalStore } from 'react';

// Whether a room, trade or favorite list shows the overview above its tiles
// (temperature, lights on, open windows). Kept per device: a wall tablet may
// want the room for its tiles. The menu and the views read the same value.

const KEY = 'show-overview';
const CHANGED = 'mui:show-overview';

// Blocked storage (a private window): the value lives in the page only
let inPage: boolean | undefined;

export const readShowOverview = (): boolean => {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored !== null) return stored !== 'false';
  } catch {
    // See inPage
  }
  return inPage ?? true;
};

export const setShowOverview = (show: boolean) => {
  inPage = show;
  try {
    localStorage.setItem(KEY, String(show));
  } catch {
    // See inPage; a full storage keeps the old value, which would win over it
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Blocked altogether
    }
  }
  window.dispatchEvent(new Event(CHANGED));
};

const subscribe = (changed: () => void) => {
  window.addEventListener(CHANGED, changed);
  // Changed in another tab
  window.addEventListener('storage', changed);
  return () => {
    window.removeEventListener(CHANGED, changed);
    window.removeEventListener('storage', changed);
  };
};

export const useShowOverview = (): [boolean, (show: boolean) => void] => [
  useSyncExternalStore(subscribe, readShowOverview, () => true),
  setShowOverview,
];
