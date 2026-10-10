import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PointerEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { fractionAlong, snap, useSliderDrag } from './useSliderDrag';

// A bar 200 px wide and 100 px high at (100, 50)
const rect = { left: 100, top: 50, width: 200, height: 100 } as DOMRect;
const bar = { getBoundingClientRect: () => rect, setPointerCapture: () => {} } as unknown as HTMLDivElement;

const pointer = (clientX: number, clientY = 0, pointerType = 'mouse') =>
  ({ clientX, clientY, pointerType, pointerId: 1, currentTarget: bar }) as unknown as PointerEvent<HTMLDivElement>;

const slider = (onCommit: (value: number) => void, tapOnTouch = false) => {
  const hook = renderHook(() =>
    useSliderDrag<HTMLDivElement>({
      value: 50,
      axis: 'x',
      valueAt: (fraction) => snap(fraction * 100, 5),
      onCommit,
      tapOnTouch,
    }),
  );
  hook.result.current.ref.current = bar;
  return hook;
};

afterEach(() => vi.useRealTimers());

describe('fractionAlong', () => {
  it('measures from the left or the top and stays on the bar', () => {
    expect(fractionAlong('x', rect, { clientX: 150, clientY: 0 })).toBe(0.25);
    expect(fractionAlong('y', rect, { clientX: 0, clientY: 125 })).toBe(0.75);
    expect(fractionAlong('x', rect, { clientX: 0, clientY: 0 })).toBe(0);
    expect(fractionAlong('x', rect, { clientX: 999, clientY: 0 })).toBe(1);
  });
});

describe('useSliderDrag', () => {
  it('follows the pointer and sends once on release', () => {
    const onCommit = vi.fn();
    const { result } = slider(onCommit);
    act(() => result.current.handlers.onPointerDown(pointer(150)));
    act(() => result.current.handlers.onPointerMove(pointer(203)));
    expect(result.current.shown).toBe(50);
    act(() => result.current.handlers.onPointerMove(pointer(260)));
    expect(result.current).toMatchObject({ shown: 80, dragging: true });
    expect(onCommit).not.toHaveBeenCalled();
    act(() => result.current.handlers.onPointerUp(pointer(260)));
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(80);
    expect(result.current).toMatchObject({ shown: 50, dragging: false });
  });

  it('sends nothing for an interrupted drag or an unchanged value', () => {
    const onCommit = vi.fn();
    const { result } = slider(onCommit);
    act(() => result.current.handlers.onPointerDown(pointer(260)));
    act(() => result.current.handlers.onPointerCancel());
    act(() => result.current.handlers.onPointerUp(pointer(260)));
    act(() => result.current.handlers.onPointerDown(pointer(200)));
    act(() => result.current.handlers.onPointerUp(pointer(200)));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('takes a tap of a finger, not its swipe, with tapOnTouch', () => {
    const onCommit = vi.fn();
    const { result } = slider(onCommit, true);
    act(() => result.current.handlers.onPointerDown(pointer(150, 0, 'touch')));
    act(() => result.current.handlers.onPointerMove(pointer(260, 0, 'touch')));
    expect(result.current.dragging).toBe(false);
    act(() => result.current.handlers.onPointerUp(pointer(280, 0, 'touch')));
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(90);
  });

  it('sends a key press when the keys rest', () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    const { result } = slider(onCommit);
    act(() => result.current.nudge(55));
    act(() => result.current.nudge(60));
    expect(result.current.shown).toBe(60);
    act(() => vi.advanceTimersByTime(599));
    expect(onCommit).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(60);
  });
});
