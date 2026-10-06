import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWakeLock } from './WakeLock';

describe('useWakeLock', () => {
  it('holds the screen on only while the setting is on', async () => {
    const release = vi.fn(async () => undefined);
    const request = vi.fn(async () => ({ release }));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    const { rerender, unmount } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: false } });
    expect(request).not.toHaveBeenCalled();
    rerender({ on: true });
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    rerender({ on: false });
    await vi.waitFor(() => expect(release).toHaveBeenCalled());
    unmount();
    delete (navigator as { wakeLock?: unknown }).wakeLock;
  });
});
