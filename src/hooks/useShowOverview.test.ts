import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readShowOverview, setShowOverview, useShowOverview } from './useShowOverview';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('useShowOverview', () => {
  it('shows the overview until it is switched off, and keeps the choice', () => {
    expect(readShowOverview()).toBe(true);
    setShowOverview(false);
    expect(localStorage.getItem('show-overview')).toBe('false');
    expect(readShowOverview()).toBe(false);
  });

  it('tells every view at once, e.g. the room while the menu switches it', () => {
    const room = renderHook(() => useShowOverview());
    const menu = renderHook(() => useShowOverview());
    act(() => menu.result.current[1](false));
    expect(room.result.current[0]).toBe(false);
    act(() => menu.result.current[1](true));
    expect(room.result.current[0]).toBe(true);
  });

  it('keeps the choice in the page when the storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    setShowOverview(false);
    expect(readShowOverview()).toBe(false);
    setShowOverview(true);
    expect(readShowOverview()).toBe(true);
  });

  it('switches over a stored choice when the storage is full and refuses the write', () => {
    // A shared origin (the CCU) whose storage is full: reading works, writing throws
    localStorage.setItem('show-overview', 'true');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    setShowOverview(false);
    expect(readShowOverview()).toBe(false);
  });
});
