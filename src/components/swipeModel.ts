// When a horizontal swipe changes the room, trade or favorite list: pure
// decisions, useSwipeNavigation.ts listens to the touches

export interface TouchPoint {
  x: number;
  y: number;
}

// How far a finger must move sideways, and how far from the screen's edge
// it must start (the edges belong to the system's back gesture)
export const SWIPE_DISTANCE = 60;
export const EDGE = 24;

// The direction of a swipe: 'next' to the left, 'previous' to the right,
// null for taps, scrolling or swipes from the edge
export const swipeDirection = (start: TouchPoint, end: TouchPoint, width: number): 'next' | 'previous' | null => {
  if (start.x < EDGE || start.x > width - EDGE) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < 2 * Math.abs(dy)) return null;
  return dx < 0 ? 'next' : 'previous';
};

// The neighbour in the order of the tabs; none past the first or last
export const neighbourId = (
  items: { id: number }[],
  activeId: string,
  direction: 'next' | 'previous',
): string | undefined => {
  const index = items.findIndex((item) => String(item.id) === activeId);
  if (index < 0) return undefined;
  const item = items[index + (direction === 'next' ? 1 : -1)];
  return item ? String(item.id) : undefined;
};

// Touches on what moves sideways itself are not swipes: sliders, fields,
// dialogs and rows that scroll
export const SWIPE_IGNORE =
  '[role="slider"], .touch-none, input, textarea, select, [role="dialog"], [contenteditable="true"], .overflow-x-auto';
