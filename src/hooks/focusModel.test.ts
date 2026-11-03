import { describe, expect, it } from 'vitest';
import { focusIdFromHash, sysvarFocusId, tileFocusAttr, tileFocusId } from './focusModel';

describe('focusModel', () => {
  it('names tiles and variables', () => {
    expect(tileFocusId(12)).toBe('tile-12');
    expect(sysvarFocusId(5)).toBe('sysvar-5');
  });

  it('lists all channels of a device tile', () => {
    expect(tileFocusAttr([1, 2, 3])).toBe('tile-1 tile-2 tile-3');
    expect(tileFocusAttr([])).toBeUndefined();
    expect(tileFocusAttr(undefined)).toBeUndefined();
  });

  it('takes only ids it made itself from a hash', () => {
    expect(focusIdFromHash('#tile-12')).toBe('tile-12');
    expect(focusIdFromHash('sysvar-5')).toBe('sysvar-5');
    expect(focusIdFromHash('')).toBeUndefined();
    expect(focusIdFromHash('#tile-1"] x')).toBeUndefined();
    expect(focusIdFromHash('#section')).toBeUndefined();
  });
});
