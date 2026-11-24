import { useEffect, useRef } from 'react';
import { SWIPE_IGNORE, swipeDirection, type TouchPoint } from '../components/swipeModel';

// Calls onSwipe on a horizontal swipe across the page (touch only)
export const useSwipeNavigation = (onSwipe: (direction: 'next' | 'previous') => void) => {
  const handler = useRef(onSwipe);
  handler.current = onSwipe;
  useEffect(() => {
    let start: TouchPoint | null = null;
    const onStart = (e: TouchEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      start =
        e.touches.length === 1 && !target?.closest(SWIPE_IGNORE)
          ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
          : null;
    };
    const onEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      if (!start || !touch) return;
      const direction = swipeDirection(start, { x: touch.clientX, y: touch.clientY }, window.innerWidth);
      start = null;
      if (direction) handler.current(direction);
    };
    const onCancel = () => {
      start = null;
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, []);
};
