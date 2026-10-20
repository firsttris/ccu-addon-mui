import { describe, expect, it } from 'vitest';
import { centeredScrollLeft, hiddenSides, pageStep } from './navTabsModel';

const row = { clientWidth: 400, scrollWidth: 1200 };

describe('centeredScrollLeft', () => {
  it('puts the active tab in the middle of the row', () => {
    expect(centeredScrollLeft({ left: 600, width: 100 }, row)).toBe(450);
  });

  it('stays at the start for tabs near it', () => {
    expect(centeredScrollLeft({ left: 50, width: 100 }, row)).toBe(0);
  });

  it('stops at the end for tabs near it', () => {
    expect(centeredScrollLeft({ left: 1100, width: 100 }, row)).toBe(800);
  });

  it('does not scroll a row that fits', () => {
    expect(centeredScrollLeft({ left: 300, width: 100 }, { clientWidth: 400, scrollWidth: 400 })).toBe(0);
  });

  it('leaves the next tab in view after clicking the last one visible', () => {
    // Tabs of 100 px: the one at 300..400 is the last fully visible
    const scroll = centeredScrollLeft({ left: 300, width: 100 }, row);
    expect(scroll + row.clientWidth).toBeGreaterThanOrEqual(500);
  });
});

describe('hiddenSides', () => {
  it('shows nothing hidden when all tabs fit', () => {
    expect(hiddenSides({ scrollLeft: 0, clientWidth: 400, scrollWidth: 400 })).toEqual({ left: false, right: false });
  });

  it('knows the tabs to the right at the start', () => {
    expect(hiddenSides({ scrollLeft: 0, ...row })).toEqual({ left: false, right: true });
  });

  it('knows the tabs on both sides in between', () => {
    expect(hiddenSides({ scrollLeft: 300, ...row })).toEqual({ left: true, right: true });
  });

  it('knows the tabs to the left at the end, despite rounding', () => {
    expect(hiddenSides({ scrollLeft: 799.5, ...row })).toEqual({ left: true, right: false });
  });
});

describe('pageStep', () => {
  it('moves by most of the row', () => {
    expect(pageStep(400)).toBe(320);
  });

  it('moves at least one pixel', () => {
    expect(pageStep(0)).toBe(1);
  });
});
