import { useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { focusIdFromHash } from './focusModel';

const LIGHT_MS = 2500;

// Scrolls to the element the URL's hash points at (data-focus, see
// focusModel.ts) and lights it up for a moment. `ready` says the page has
// its data, so the element can exist; the hash is dropped afterwards so a
// reload or the back button does not do it again.
export const useFocusFromHash = (ready: boolean) => {
  const hash = useRouterState({ select: (s) => s.location.hash });
  const router = useRouter();
  const id = focusIdFromHash(hash);
  const done = useRef<string | undefined>(undefined);
  // Kept outside the effect: dropping the hash below runs it again
  const lit = useRef<{ holder: HTMLElement; timer: number } | undefined>(undefined);
  const unlight = () => {
    if (!lit.current) return;
    window.clearTimeout(lit.current.timer);
    lit.current.holder.removeAttribute('data-palette-focus');
    lit.current = undefined;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the page goes
  useEffect(() => unlight, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: unlight only uses a ref
  useEffect(() => {
    // The hash is gone (dropped below or left by hand): the same target may
    // come again, from the palette or a link
    if (!id) {
      done.current = undefined;
      return;
    }
    if (!ready || done.current === id) return;
    const holder = document.querySelector<HTMLElement>(`[data-focus~="${id}"]`);
    if (!holder) return;
    done.current = id;
    // A wrapper without a box of its own (display: contents) scrolls by its child
    const box = getComputedStyle(holder).display === 'contents' ? holder.firstElementChild : holder;
    box?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    unlight();
    holder.setAttribute('data-palette-focus', '');
    const { pathname, searchStr } = router.state.location;
    router.history.replace(pathname + searchStr);
    lit.current = { holder, timer: window.setTimeout(unlight, LIGHT_MS) };
  }, [id, ready, router]);
};
