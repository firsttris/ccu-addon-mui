import { describe, expect, it } from 'vitest';
import { KEY_PATTERN, SGTIN_PATTERN, cleanLabel } from './Pairing';

describe('label of an HmIP device', () => {
  it('accepts SGTIN and KEY with dashes', () => {
    expect(SGTIN_PATTERN.test(cleanLabel('3014-F711-A000-1F98-A9B4-C2D1'))).toBe(true);
    expect(KEY_PATTERN.test(cleanLabel('00112233445566778899aabbccddeeff'))).toBe(true);
    expect(KEY_PATTERN.test(cleanLabel('ABCEF-GHJKL-MNPQR-STUWX-YZ012-3'))).toBe(true);
  });
  it('rejects wrong values', () => {
    expect(SGTIN_PATTERN.test(cleanLabel('3014-F711'))).toBe(false);
    // D, I, O and V are no key characters
    expect(KEY_PATTERN.test(cleanLabel('DDDDD-DDDDD-DDDDD-DDDDD-DDDDD-D'))).toBe(false);
  });
});
