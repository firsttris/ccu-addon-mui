import { describe, expect, it } from 'vitest';
import { neighbourId, swipeDirection } from './swipeModel';

describe('swipeDirection', () => {
  it('reads a clear sideways swipe', () => {
    expect(swipeDirection({ x: 300, y: 200 }, { x: 150, y: 210 }, 400)).toBe('next');
    expect(swipeDirection({ x: 100, y: 200 }, { x: 250, y: 190 }, 400)).toBe('previous');
  });
  it('ignores taps, scrolling and swipes from the edge', () => {
    expect(swipeDirection({ x: 200, y: 200 }, { x: 170, y: 200 }, 400)).toBeNull();
    expect(swipeDirection({ x: 200, y: 100 }, { x: 120, y: 300 }, 400)).toBeNull();
    expect(swipeDirection({ x: 10, y: 200 }, { x: 200, y: 200 }, 400)).toBeNull();
    expect(swipeDirection({ x: 390, y: 200 }, { x: 200, y: 200 }, 400)).toBeNull();
  });
});

describe('neighbourId', () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
  it('steps through the tabs without wrapping', () => {
    expect(neighbourId(items, '2', 'next')).toBe('3');
    expect(neighbourId(items, '2', 'previous')).toBe('1');
    expect(neighbourId(items, '3', 'next')).toBeUndefined();
    expect(neighbourId(items, '1', 'previous')).toBeUndefined();
    expect(neighbourId(items, '9', 'next')).toBeUndefined();
  });
});
