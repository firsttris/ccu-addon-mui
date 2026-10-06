import { useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

// Keeping the screen on is for the tablet on the wall, not for every phone
// (it drains the battery). Set per device in the menu; installed as an app
// (a wall tablet usually is) it starts on, in a browser tab off.
export const wakeLockAvailable = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator;

const installed = () => typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches === true;

export const useWakeLockSetting = () => useLocalStorage<boolean>('keep-screen-on', installed());

// Holds the screen on while the setting is on. The Wake Lock API only exists
// in a secure context (HTTPS or localhost).
export const useWakeLock = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled || !wakeLockAvailable()) return;
    let lock: WakeLockSentinel | undefined;
    let stopped = false;
    const request = async () => {
      try {
        const next = await navigator.wakeLock.request('screen');
        if (stopped) {
          await next.release();
        } else {
          lock = next;
        }
      } catch {
        // Refused (e.g. battery saver): the screen goes off as usual
      }
    };
    request();
    // The browser releases the lock whenever the page is hidden (tab
    // switch, screen off): ask again when it is shown
    const onVisible = () => {
      if (document.visibilityState === 'visible') request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => undefined);
    };
  }, [enabled]);
};
