// --- Scrolling the row of tabs sideways when they don't all fit

interface Row {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}

const maxScroll = (row: Omit<Row, 'scrollLeft'>) => Math.max(0, row.scrollWidth - row.clientWidth);

// The active tab in the middle of the row, as far as the row reaches: its
// neighbours on both sides stay in view, so the next tab can be clicked
// (from the tab's position alone, so it ends up the same however often
// this runs)
export const centeredScrollLeft = (tab: { left: number; width: number }, row: Omit<Row, 'scrollLeft'>) =>
  Math.round(Math.min(maxScroll(row), Math.max(0, tab.left + tab.width / 2 - row.clientWidth / 2)));

// The sides with tabs hidden behind them (1 px slack for rounding on
// zoomed screens)
export const hiddenSides = (row: Row) => ({
  left: row.scrollLeft > 1,
  right: row.scrollLeft < maxScroll(row) - 1,
});

// One click on an arrow: most of the row, so a tab cut off at the edge
// comes fully into view
export const pageStep = (clientWidth: number) => Math.max(1, Math.round(clientWidth * 0.8));
