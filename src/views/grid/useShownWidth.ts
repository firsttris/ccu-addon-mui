import { useEffect, useRef, useState } from 'react';

// The width an element is shown with, measured while active and kept while
// not: a section's width as shown before arranging, kept while arranging
// sets it
export const useShownWidth = <T extends HTMLElement>(active: boolean) => {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number>();
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const measure = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [active]);
  return { ref, width };
};
