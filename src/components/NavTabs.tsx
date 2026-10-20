import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useEffects } from '../contexts/EffectsContext';
import { cn } from '../lib/utils';
import ChevronLeftIcon from '~icons/lucide/chevron-left';
import ChevronRightIcon from '~icons/lucide/chevron-right';
import { centeredScrollLeft, hiddenSides, pageStep } from './navTabsModel';

// --- Tabs of rooms, trades or favorite lists, with a marker that glides
// to the active one

interface NavTabsProps {
  label: string;
  items: { id: number; name: string }[];
  activeId: string;
  to: '/room/$roomId' | '/trade/$tradeId' | '/favorite/$favoriteId';
}

const tabParams = (to: NavTabsProps['to'], id: string) =>
  to === '/room/$roomId' ? { roomId: id } : to === '/trade/$tradeId' ? { tradeId: id } : { favoriteId: id };

export const NavTabs = ({ label, items, activeId, to }: NavTabsProps) => {
  const effects = useEffects();
  const listRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLElement>(null);
  const [marker, setMarker] = useState<{ left: number; width: number } | null>(null);
  const [hidden, setHidden] = useState({ left: false, right: false });
  const updateHidden = () => {
    const row = rowRef.current;
    if (!row) return;
    const next = hiddenSides(row);
    setHidden((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: measures again when the active tab or the tabs change
  useLayoutEffect(() => {
    const update = () => {
      const active = listRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
      setMarker(active ? { left: active.offsetLeft, width: active.offsetWidth } : null);
      // Only the tab row scrolls sideways, never the page
      const row = rowRef.current;
      if (active && row) {
        row.scrollLeft = centeredScrollLeft({ left: active.offsetLeft, width: active.offsetWidth }, row);
      }
      updateHidden();
    };
    update();
    // Tab widths change when the font has loaded or the window is resized
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    if (listRef.current) observer?.observe(listRef.current);
    let active = true;
    document.fonts?.ready.then(() => active && update());
    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [activeId, items]);

  if (items.length < 2) {
    return null;
  }
  // Without a touch screen or a trackpad the row can't be swiped: the
  // arrows page it, where tabs are hidden (the tabs themselves stay
  // reachable by keyboard, so the arrows are for the mouse only)
  const arrow = (side: 'left' | 'right') =>
    hidden[side] && (
      <button
        type="button"
        tabIndex={-1}
        data-scroll={side}
        aria-hidden
        onClick={() => {
          const row = rowRef.current;
          const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
          row?.scrollBy({
            left: (side === 'left' ? -1 : 1) * pageStep(row.clientWidth),
            behavior: still ? 'auto' : 'smooth',
          });
        }}
        className={cn(
          'press absolute top-[5px] bottom-[9px] z-10 flex w-11 items-center justify-center rounded-lg border bg-card text-muted-foreground shadow-sm hover:text-foreground',
          side === 'left' ? 'left-[5px]' : 'right-[5px]',
        )}
      >
        {side === 'left' ? <ChevronLeftIcon className="size-5" /> : <ChevronRightIcon className="size-5" />}
      </button>
    );
  return (
    <div className="relative">
      {arrow('left')}
      {arrow('right')}
      <nav
        ref={rowRef}
        aria-label={label}
        onScroll={updateHidden}
        className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
      >
        <div ref={listRef} className="tile-edge relative flex w-max min-w-full gap-1 rounded-xl border bg-card p-1">
          {marker && (
            <div
              aria-hidden
              className="absolute top-1 bottom-1 rounded-lg bg-primary transition-[left,width] duration-400 ease-[cubic-bezier(.3,.8,.2,1)]"
              style={{
                left: marker.left,
                width: marker.width,
                boxShadow: effects.on
                  ? `0 0 ${18 * effects.k}px rgba(250,250,250,${Math.min(1, 0.14 * effects.k)})`
                  : undefined,
              }}
            />
          )}
          {items.map((item) => {
            const active = String(item.id) === activeId;
            return (
              <Link
                key={item.id}
                to={to}
                params={tabParams(to, String(item.id)) as never}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'press relative flex h-11 flex-1 items-center justify-center rounded-lg px-4 text-[15px] font-medium whitespace-nowrap',
                  active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
