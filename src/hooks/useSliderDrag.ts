import { type PointerEvent, useEffect, useRef, useState } from 'react';

// Where a pointer is along a slider: 0 at the left or top, 1 at the right
// or bottom
export const fractionAlong = (axis: 'x' | 'y', rect: DOMRect, event: { clientX: number; clientY: number }) => {
  const fraction = axis === 'x' ? (event.clientX - rect.left) / rect.width : (event.clientY - rect.top) / rect.height;
  return Math.max(0, Math.min(1, fraction));
};

// A value rounded to its steps (5 % steps of a level)
export const snap = (value: number, step: number) => Math.round(value / step) * step;

// How long the arrow keys rest before their value is sent
const KEY_DELAY = 600;

// The drag of a bar slider (brightness, hue, a blind's window): the value
// follows the pointer and is sent once on release, one radio telegram
// instead of one per pixel. An interrupted drag (pointercancel: the browser
// scrolls instead) sends nothing. With tapOnTouch a finger doesn't drag: a
// tap sets the value, a swipe scrolls the page.
export const useSliderDrag = <E extends HTMLElement>({
  value,
  axis,
  valueAt,
  onCommit,
  tapOnTouch = false,
}: {
  value: number;
  axis: 'x' | 'y';
  // The value at a fraction along the bar
  valueAt: (fraction: number) => number;
  onCommit: (value: number) => void;
  tapOnTouch?: boolean;
}) => {
  const ref = useRef<E>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const touch = useRef<number | null>(null);
  const keyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (keyTimer.current) clearTimeout(keyTimer.current);
    },
    [],
  );

  const at = (event: PointerEvent<E>) =>
    // biome-ignore lint/style/noNonNullAssertion: only called from the pointer events of the mounted element
    valueAt(fractionAlong(axis, ref.current!.getBoundingClientRect(), event));
  const commit = (next: number) => {
    if (next !== value) onCommit(next);
    setDrag(null);
  };

  const handlers = {
    onPointerDown: (event: PointerEvent<E>) => {
      if (tapOnTouch && event.pointerType === 'touch') {
        touch.current = event.pointerId;
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag(at(event));
    },
    onPointerMove: (event: PointerEvent<E>) => {
      if (drag !== null) setDrag(at(event));
    },
    onPointerUp: (event: PointerEvent<E>) => {
      if (touch.current === event.pointerId) {
        touch.current = null;
        commit(at(event));
      } else if (drag !== null) {
        commit(drag);
      }
    },
    onPointerCancel: () => {
      touch.current = null;
      setDrag(null);
    },
  };

  // A key press shows its value at once and sends it when the keys rest
  const nudge = (next: number) => {
    setDrag(next);
    if (keyTimer.current) clearTimeout(keyTimer.current);
    keyTimer.current = setTimeout(() => commit(next), KEY_DELAY);
  };

  return { ref, shown: drag ?? value, dragging: drag !== null, handlers, nudge };
};
