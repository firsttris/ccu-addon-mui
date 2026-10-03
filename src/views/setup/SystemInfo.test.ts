import { describe, expect, it } from 'vitest';
import { isNewerVersion } from './SystemInfo';

describe('isNewerVersion', () => {
  it('compares the numbers of firmware versions', () => {
    expect(isNewerVersion('3.89.11.20260919', '3.89.10.20260801')).toBe(true);
    expect(isNewerVersion('3.89.11', '3.89.11')).toBe(false);
    expect(isNewerVersion('3.89.11.20260919', '3.89.11')).toBe(true);
    expect(isNewerVersion('3.79.6', '3.83.6')).toBe(false);
    expect(isNewerVersion('3.100.0', '3.99.9')).toBe(true);
  });
});
